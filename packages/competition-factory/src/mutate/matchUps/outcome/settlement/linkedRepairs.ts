import { findMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { linkedWinnerRelease } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { carryHomeLanding, carryLeavingWith } from '@Mutate/matchUps/drawPositions/carryHome';
import { participatesInExitCascade } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getUpdatedDrawPositions } from '@Mutate/drawDefinitions/matchUpGovernor/getUpdatedDrawPositions';
import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { drawPositionAssignmentRefusal } from '@Query/drawDefinition/drawPositionAssignmentRefusal';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { findStructure } from '@Acquire/findStructure';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { WorkingView } from '../overlay';
import type { OutcomeOp } from '../ops';

type Args = { working: WorkingView; stage: 'missed' | 'unearned'; event?: Event; tournamentRecord?: Tournament };
type Repairs = { ops: OutcomeOp[]; reasons: string[]; error?: typeof SETTLE_BOUND_REACHED; outstanding?: string };
type Missed = ReturnType<typeof findMissedLinkAdvancements>[number];
type Unearned = ReturnType<typeof getUnearnedLinkAdvancements>[number];

/** Only independently projected removals supply the trigger. The source and physical returning side
 * are read from the original carry and the surviving bracket, even when outside all directed edges. */
export function planReturningCarries({
  before,
  working,
  affectedMatchUpIds,
}: {
  before: DrawDefinition;
  working: WorkingView;
  affectedMatchUpIds: Iterable<string>;
}): Repairs {
  const ids = new Set(affectedMatchUpIds);
  const ops: OutcomeOp[] = [];
  const reasons = new Set<string>();
  for (const structure of before.structures ?? []) {
    const after = findStructure({
      drawDefinition: working.drawDefinition,
      structureId: structure.structureId,
    }).structure;
    const matches = matchUpsOf(after) ?? [];
    for (const prior of matchUpsOf(structure) ?? []) {
      if (!ids.has(prior.matchUpId) || !prior.sideExitProvenance) continue;
      const current = matches.find((m) => m.matchUpId === prior.matchUpId);
      if (!current) continue;
      for (const position of prior.drawPositions ?? []) {
        if (!position || current.drawPositions?.includes(position)) continue;
        const oldSeats = positionAssignmentsOf(structure) ?? [];
        const carry = carryLeavingWith({
          drawDefinition: before,
          structureId: structure.structureId,
          matchUp: prior,
          drawPosition: position,
          positionAssignments: oldSeats,
        });
        if (!carry) continue;
        const home = carryHomeLanding({
          drawDefinition: working.drawDefinition,
          structureId: structure.structureId,
          matchUps: matches,
          from: current,
          carry,
          drawPosition: position,
        });
        if (!home) continue;
        const carrier = oldSeats.find((s) => s.drawPosition === position)?.participantId;
        const seated = positionAssignmentsOf(after)?.find((s) => s.drawPosition === position);
        // The participant returned to their own still-standing loss. A new occupant, another
        // home or a newly contested result requires its own forward proof.
        if (
          !carrier ||
          seated?.participantId !== carrier ||
          seated.bye ||
          home.home.matchUpId !== carry.sourceMatchUpId ||
          home.home.matchUpStatus !== carry.previousMatchUpStatus ||
          !home.home.winningSide ||
          home.home.winningSide === home.homeSide
        ) {
          reasons.add('returning carry requires another landing or changed occupant');
          continue;
        }
        ops.push({
          op: 'mergeSideExitProvenance',
          matchUpId: home.home.matchUpId,
          provenance: { [home.homeSide]: { ...carry } },
        });
      }
    }
  }
  return { ops, reasons: [...reasons] };
}

function missedAction({ working, tournamentRecord, event }: Args, debt: Missed): OutcomeOp[] | undefined {
  const { drawDefinition } = working;
  const target = debt.winnerMatchUp;
  const source = findStructure({ drawDefinition, structureId: debt.matchUp.structureId }).structure;
  const receiver = findStructure({ drawDefinition, structureId: target.structureId }).structure;
  const sourceSeat = positionAssignmentsOf(source)?.find((s) => s.drawPosition === debt.winningDrawPosition);
  const pid = sourceSeat?.participantId;
  if (!pid || sourceSeat?.bye || source?.seedAssignments?.some((s) => s.participantId === pid)) return;
  const stored = working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === target.matchUpId);
  if (
    !stored ||
    stored.winningSide ||
    stored.matchUpStatus !== TO_BE_PLAYED ||
    stored.tieMatchUps?.length ||
    participatesInExitCascade({ matchUp: stored })
  )
    return;
  const seats = positionAssignmentsOf(receiver) ?? [];
  const positions = stored.drawPositions ?? [];
  const openings = seats.filter(
    (s) => positions.includes(s.drawPosition) && !s.participantId && !s.bye && !s.qualifier,
  );
  const existing = seats.find((s) => s.participantId === pid)?.drawPosition;
  const mapped = getSideDrawPosition({
    drawDefinition,
    structureId: target.structureId,
    matchUp: target,
    sideNumber: (debt.winnerMatchUpDrawPositionIndex ?? -1) + 1,
  });
  if (openings.length) {
    const seat =
      debt.winnerTargetLink.target.roundNumber === 1 && openings.some((s) => s.drawPosition === mapped)
        ? mapped
        : openings.at(-1)?.drawPosition;
    if (!seat) return;
    // directWinner logs a refused assignment and continues. It never moves the occupant to a second position.
    const refused = drawPositionAssignmentRefusal({
      drawDefinition,
      structureId: target.structureId,
      drawPosition: seat,
      participantId: pid,
      tournamentRecord,
      event,
    });
    if (refused) return [];
    const holders = matchUpsOf(receiver)?.filter((m) => m.drawPositions?.includes(seat));
    if (holders?.length !== 1 || seats.some((s) => positions.includes(s.drawPosition) && s.bye)) return;
    return [{ op: 'assignPosition', structureId: target.structureId, drawPosition: seat, participantId: pid }];
  }
  if (!existing) return;
  const placement = getUpdatedDrawPositions({ drawPosition: existing, drawPositions: positions });
  if (
    !placement.positionAssigned ||
    !placement.positionAdded ||
    !placement.updatedDrawPositions.every((p) => seats.some((s) => s.drawPosition === p && !s.bye && s.participantId))
  )
    return;
  return [
    { op: 'setMatchUpDrawPositions', matchUpId: target.matchUpId, drawPositions: placement.updatedDrawPositions },
  ];
}

function unearnedAction(working: WorkingView, debt: Unearned): OutcomeOp[] | undefined {
  const { link, participantId } = debt;
  const release = linkedWinnerRelease({
    drawDefinition: working.drawDefinition,
    matchUpsMap: working.matchUpsMap,
    participantId,
    linkType: link.linkType,
    structureId: link.source.structureId,
    roundNumber: link.source.roundNumber,
  });
  if (!release) return [];
  const structureId = release.targetStructure.structureId;
  const drawPosition = release.targetDrawPosition;
  if (release.kind === 'assignment')
    return [{ op: 'relabelPosition', structureId, drawPosition, participantId: undefined }];
  const held =
    matchUpsOf(release.targetStructure)?.filter(
      (m) => m.drawPositions?.includes(drawPosition) && (m.roundNumber ?? 0) >= release.targetRoundNumber,
    ) ?? [];
  if (held.length !== 1) return;
  const [match] = held;
  if (
    match.matchUpStatus !== TO_BE_PLAYED ||
    match.winningSide ||
    participatesInExitCascade({ matchUp: match }) ||
    (matchUpsOf(release.targetStructure) ?? []).some(
      (m) =>
        m.roundNumber === (match.roundNumber ?? 0) - 1 &&
        m.drawPositions?.includes(drawPosition) &&
        m.matchUpStatus === 'BYE',
    ) ||
    working.drawDefinition.links?.some(
      (l) =>
        l.source.structureId === structureId && l.source.roundNumber === match.roundNumber && l.linkType === 'WINNER',
    )
  )
    return;
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: match.matchUpId,
      drawPositions: (match.drawPositions ?? []).filter((p) => p !== drawPosition),
      releasedDrawPosition: drawPosition,
    },
  ];
}

/** Each action is folded once into the clock-free cursor. The caller records these ops as already
 * folded. The early pass takes one list, the late pass re-reads its count after each entire wave. */
export function planLinkedRepairs(args: Args): Repairs {
  const { working, stage } = args;
  const work: Repairs = { ops: [], reasons: [] };
  if (!working.drawDefinition.links?.length) return work;
  function fold(action: OutcomeOp[] | undefined, id: string): boolean {
    if (!action || !working.temporal) {
      work.reasons.push('linked ' + stage + ' requires compound placement: ' + id);
      work.outstanding = id;
      return false;
    }
    if (!action.length) return true;
    const { error } = working.apply(action);
    if (error) {
      work.reasons.push(error);
      work.outstanding = id;
      return false;
    }
    work.ops.push(...action);
    return true;
  }
  if (stage === 'missed') {
    for (const debt of findMissedLinkAdvancements(working)) {
      if (!fold(missedAction(args, debt), debt.winnerMatchUp.matchUpId)) break;
    }
  } else {
    let debts = getUnearnedLinkAdvancements(working);
    let guard = working.matchUpsMap.drawMatchUps.length + 1;
    while (debts.length && guard > 0) {
      guard--;
      const count = debts.length;
      for (const debt of debts) {
        if (!fold(unearnedAction(working, debt), debt.targetMatchUp.matchUpId)) return work;
      }
      debts = getUnearnedLinkAdvancements(working);
      if (debts.length >= count) break;
      if (!guard && debts.length) {
        work.error = SETTLE_BOUND_REACHED;
        work.outstanding = debts[0].targetMatchUp.matchUpId;
      }
    }
  }
  if (work.ops.length) work.reasons.push('linked ' + stage + ' notices and clocks require certification');
  return work;
}
