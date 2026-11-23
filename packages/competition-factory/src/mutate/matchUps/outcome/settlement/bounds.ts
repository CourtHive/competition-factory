import {
  getExitArrivalSideNumber,
  getHeldExit,
  isHolderBesideBye,
  strandsItsExit,
} from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { deriveExitStateFromProvenance, producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import {
  claimAssignment,
  claimEdges,
  exitOriginLanding,
  exitOriginRelays,
  hasSourceOrigin,
  winnerClaimEdge,
} from '../plan/placementClaims';
import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { getByeCrossing } from '@Query/drawDefinition/getByeCrossings';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { createWorkingView, type WorkingView } from '../overlay';

import type { DrawDefinition, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeRequest } from '../types';
import type { OutcomeOp } from '../ops';

function stored(working: WorkingView, match: HydratedMatchUp) {
  return working.matchUpsMap.drawMatchUps.find((m) => m.matchUpId === match.matchUpId);
}

function landing(working: WorkingView, source: HydratedMatchUp) {
  const edges = winnerClaimEdge(working, source);
  const match = edges?.targetMatchUps.winnerMatchUp;
  if (!match || edges.targetLinks.winnerTargetLink || checkScoreHasValue({ score: match.score })) return;
  const side = getExitArrivalSideNumber({
    inContextDrawMatchUps: working.inContextDrawMatchUps,
    sourceMatchUp: source,
    nextWinnerMatchUp: match,
  });
  if (side === 1 || side === 2) return { match, side: side as 1 | 2 };
  return undefined;
}

function emptyBye(working: WorkingView, match: HydratedMatchUp) {
  const positions = match.drawPositions?.filter(Boolean);
  return (
    match.matchUpStatus === BYE &&
    !match.winningSide &&
    positions?.length === 1 &&
    claimAssignment(working, match, positions[0])?.bye &&
    !match.sides?.some((s) => s.participantId) &&
    !Object.keys(getSideExitProvenance({ matchUp: stored(working, match) }) ?? {}).length
  );
}

function producedMark(source: HydratedMatchUp): SideExitProvenanceEntry {
  return {
    sourceMatchUpId: source.matchUpId,
    previousMatchUpStatus: source.matchUpStatus,
    matchUpStatus: producedExitStatus(source.matchUpStatus),
  };
}

/** A double exit produces its exit on the feeder's side of an unoccupied winner target
 * holding a BYE. A mark from an earlier call or an already seated arrival is not this seed. */
function markEmptyBye(working: WorkingView, source: HydratedMatchUp): OutcomeOp[] {
  const next = landing(working, source);
  if (!next || !emptyBye(working, next.match) || next.match.sides?.some((s) => s.sideNumber === next.side && s.bye))
    return [];
  return [
    { op: 'setSideExitProvenance', matchUpId: next.match.matchUpId, provenance: { [next.side]: producedMark(source) } },
  ];
}

/** The reservation installed by this double exit can release an actual losing participant
 * across a BYE. Bind both entrants to their still-live donors before predicting convergence. */
function convergingCarrier(working: WorkingView, before: DrawDefinition, source: HydratedMatchUp): OutcomeOp[] {
  const edges = claimEdges(working, source);
  const holder = edges.targetMatchUps?.loserMatchUp;
  const position = edges.targetMatchUps?.loserTargetDrawPosition;
  if (
    !holder ||
    !position ||
    !edges.targetLinks?.loserTargetLink ||
    holder.matchUpId !== source.loserMatchUpId ||
    holder.structureId === source.structureId ||
    !holder.winningSide ||
    !isExit(holder.matchUpStatus) ||
    checkScoreHasValue({ score: holder.score }) ||
    holder.loserMatchUpId
  )
    return [];
  const oldSeat = claimAssignment({ ...working, drawDefinition: before }, holder, position);
  const newSeat = claimAssignment(working, holder, position);
  const oldHolder = getMatchUpsMap({ drawDefinition: before }).drawMatchUps.find(
    (m) => m.matchUpId === holder.matchUpId,
  );
  if (
    !oldSeat ||
    oldSeat.bye ||
    oldSeat.participantId ||
    !newSeat?.byeFromPropagation ||
    !newSeat.bye ||
    newSeat.participantId ||
    oldHolder?.winningSide !== holder.winningSide ||
    oldHolder.matchUpStatus !== holder.matchUpStatus ||
    !holder.sides?.some((s) => s.sideNumber === holder.winningSide && s.drawPosition === position)
  )
    return [];
  const carrierSide = 3 - holder.winningSide;
  const carrier = holder.sides?.find((s) => s.sideNumber === carrierSide);
  const origin = exitOriginLanding(working, holder, carrierSide, 'loser');
  if (
    !carrier?.participantId ||
    !carrier.drawPosition ||
    !origin?.donor.winningSide ||
    !isExit(origin.donor.matchUpStatus) ||
    !exitOriginRelays(working, origin, holder, carrier.participantId) ||
    origin.targetPosition !== carrier.drawPosition ||
    origin.donor.sides?.find((s) => s.sideNumber === 3 - origin.donor.winningSide!)?.participantId !==
      carrier.participantId ||
    Object.keys(holder.sideExitProvenance ?? {}).length !== 1
  )
    return [];
  const next = landing(working, holder);
  if (
    !next ||
    next.match.winningSide ||
    !isExit(next.match.matchUpStatus) ||
    next.match.drawPositions?.some(Boolean) ||
    next.match.sides?.some((s) => s.participantId || s.bye) ||
    Object.keys(next.match.sideExitProvenance ?? {}).length !== 1
  )
    return [];
  const opposite = exitOriginLanding(working, next.match, 3 - next.side, 'winner');
  if (
    !opposite ||
    opposite.landing.matchUpId !== next.match.matchUpId ||
    !isDoubleExit(opposite.donor.matchUpStatus) ||
    opposite.donor.winningSide ||
    producedExitStatus(opposite.donor.matchUpStatus) !== opposite.mark.matchUpStatus ||
    landing(working, opposite.donor)?.side !== 3 - next.side
  )
    return [];
  const marks = { ...next.match.sideExitProvenance, [next.side]: origin.mark };
  const award = deriveExitStateFromProvenance(marks);
  if (!award || !isDoubleExit(award.matchUpStatus)) return [];
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: holder.matchUpId,
      matchUpStatus: BYE,
      deletesWinningSide: true,
      stampsScoredTime: false,
    },
    { op: 'setSideExitProvenance', matchUpId: holder.matchUpId, provenance: { [carrierSide]: origin.mark } },
    { op: 'setMatchUpDrawPositions', matchUpId: next.match.matchUpId, drawPositions: [carrier.drawPosition] },
    {
      op: 'setMatchUpResult',
      matchUpId: next.match.matchUpId,
      matchUpStatus: award.matchUpStatus,
      deletesWinningSide: true,
      stampsScoredTime: false,
    },
    { op: 'setSideExitProvenance', matchUpId: next.match.matchUpId, provenance: marks },
  ];
}

export function heldDirectionInputs(
  working: WorkingView,
  before: DrawDefinition,
  request: OutcomeRequest,
): OutcomeOp[] {
  if (!isDoubleExit(request.matchUpStatus) || request.winningSide || !request.flags.propagateExitStatus) return [];
  const source = working.inContextDrawMatchUps.find((m) => m.matchUpId === request.matchUpId);
  const prior = getMatchUpsMap({ drawDefinition: before }).drawMatchUps.find((m) => m.matchUpId === request.matchUpId);
  if (
    !source ||
    source.collectionId ||
    source.matchUpStatus !== request.matchUpStatus ||
    source.winningSide ||
    prior?.matchUpStatus !== TO_BE_PLAYED ||
    prior.winningSide ||
    checkScoreHasValue({ score: prior.score }) ||
    Object.keys(getSideExitProvenance({ matchUp: prior }) ?? {}).length
  )
    return [];
  return [...markEmptyBye(working, source), ...convergingCarrier(working, before, source)];
}

function obligations(working: WorkingView) {
  let terminal = false;
  const frame = {
    drawDefinition: working.drawDefinition,
    inContextDrawMatchUps: working.inContextDrawMatchUps,
    matchUpsMap: working.matchUpsMap,
  };
  const held = frame.inContextDrawMatchUps.find((matchUp) => getHeldExit({ ...frame, matchUp }));
  const crossing = frame.inContextDrawMatchUps.map((matchUp) => getByeCrossing({ ...frame, matchUp })).find(Boolean);
  const stranded = frame.inContextDrawMatchUps.filter((matchUp) =>
    strandsItsExit({
      ...frame,
      matchUp,
      terminalMoves: () => {
        terminal = true;
        return false;
      },
    }),
  );
  const beside = frame.inContextDrawMatchUps.some((matchUp) =>
    isHolderBesideBye({ drawDefinition: frame.drawDefinition, matchUp }),
  );
  return { held, crossing, stranded, beside, terminal };
}

function cursor(working: WorkingView) {
  return createWorkingView({ ...working, structural: true, clockFree: true });
}

/** A production can create a crossing after the first crossing pass has already finished.
 * Prove one unlinked production into an empty BYE, its award and the actual seat advanced
 * into the link source. Recheck the canonical crossing on the projected assignments. */
function crossingAfterProduction(working: WorkingView, source: HydratedMatchUp) {
  if (source.loserMatchUpId || hasSourceOrigin(working.inContextDrawMatchUps, source.matchUpId)) return false;
  const first = landing(working, source);
  if (
    !first ||
    !emptyBye(working, first.match) ||
    first.match.loserMatchUpId ||
    first.match.sides?.some((s) => s.sideNumber === first.side && s.bye)
  )
    return false;
  const award = landing(working, first.match);
  if (
    !award ||
    award.match.matchUpStatus !== TO_BE_PLAYED ||
    award.match.winningSide ||
    award.match.loserMatchUpId ||
    Object.keys(award.match.sideExitProvenance ?? {}).length
  )
    return false;
  const entrants = award.match.sides?.filter((s) => s.participantId && !s.bye);
  const participant = entrants?.length === 1 && entrants[0];
  if (
    !participant ||
    !participant.drawPosition ||
    award.match.drawPositions?.filter(Boolean).length !== 1 ||
    claimAssignment(working, award.match, participant.drawPosition)?.participantId !== participant.participantId
  )
    return false;
  const opposite = getExitWinningSide({
    inContextDrawMatchUps: working.inContextDrawMatchUps,
    matchUpId: award.match.matchUpId,
    drawPosition: participant.drawPosition,
  });
  if (opposite !== 3 - award.side) return false;
  const onward = landing(working, award.match);
  if (!onward || !emptyBye(working, onward.match) || onward.match.loserMatchUpId || !onward.match.winnerMatchUpId)
    return false;
  const projection = cursor(working);
  const mark = producedMark(source);
  const { error } = projection.apply([
    { op: 'setSideExitProvenance', matchUpId: first.match.matchUpId, provenance: { [first.side]: mark } },
    {
      op: 'setMatchUpResult',
      matchUpId: award.match.matchUpId,
      matchUpStatus: mark.matchUpStatus!,
      winningSide: (3 - award.side) as 1 | 2,
      stampsScoredTime: false,
    },
    { op: 'setSideExitProvenance', matchUpId: award.match.matchUpId, provenance: { [award.side]: mark } },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: onward.match.matchUpId,
      drawPositions: [...(onward.match.drawPositions ?? []), participant.drawPosition].sort((a, b) => a - b),
    },
  ]);
  if (error) return false;
  const matchUp = projection.inContextDrawMatchUps.find((m) => m.matchUpId === onward.match.matchUpId)!;
  const crossing = getByeCrossing({ ...projection, matchUp });
  return (
    !!crossing &&
    'participantId' in crossing &&
    crossing.participantId === participant.participantId &&
    crossing.drawPosition === participant.drawPosition
  );
}

export function inspectHeldPass(working: WorkingView, before?: DrawDefinition, request?: OutcomeRequest) {
  const inputs = before && request ? heldDirectionInputs(working, before, request) : [];
  const pass = inputs.length ? cursor(working) : working;
  const unavailable = inputs.length && pass.apply(inputs).error;
  const { held, crossing, stranded, beside, terminal } = obligations(pass);
  let site: string | undefined;
  if (!unavailable) {
    if (held) {
      if (SETTLE_PASS_LIMITS.heldExits === 0) site = 'sendHeldExitsOn';
    } else if (crossing) {
      if ('participantId' in crossing && SETTLE_PASS_LIMITS.linkCrossings === 0) site = 'crossLinksThroughByes';
    } else if (stranded.length && !terminal) {
      if (SETTLE_PASS_LIMITS.strandedConvergences === 0) site = 'produceStrandedConvergences';
      else if (
        stranded.length === 1 &&
        SETTLE_PASS_LIMITS.linkCrossings === 0 &&
        crossingAfterProduction(pass, stranded[0])
      )
        site = 'crossLinksThroughByes';
    }
  }
  return {
    hasWork: !!(unavailable || held || crossing || stranded.length || beside || terminal),
    terminal,
    error: site ? { error: SETTLE_BOUND_REACHED, info: site } : undefined,
  };
}
