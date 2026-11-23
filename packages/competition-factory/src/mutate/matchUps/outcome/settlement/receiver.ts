import { holdsRelayedLoser } from './byeRelaySupport';
import { deriveExitStateFromProvenance, deriveStatusCodes } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { getSideExitProvenance, carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { claimAssignment } from '../plan/placementClaims';
import { withdrawnExitReset } from '../plan/unwindPath';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';

import type { SideExitProvenance, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { Edge, Grant, Frame } from './dependencies';
import type { withdrawnAwardRelease } from './release';
import type { OutcomeOp } from '../ops';

export type Input = { edge: Edge; grant: Grant; source: HydratedMatchUp };
export type Rule = { ops: OutcomeOp[]; reasons: string[] };
const stop = (reason: string): Rule => ({ ops: [], reasons: [reason] });

function sameMark(left?: SideExitProvenanceEntry, right?: SideExitProvenanceEntry) {
  return (
    left?.matchUpStatus === right?.matchUpStatus &&
    left?.sourceMatchUpId === right?.sourceMatchUpId &&
    left?.previousMatchUpStatus === right?.previousMatchUpStatus
  );
}

export function sameGrant(a: Grant, b: Grant) {
  return (
    a.participant === b.participant &&
    a.sourcePosition === b.sourcePosition &&
    a.reserved === b.reserved &&
    sameMark(a.mark, b.mark)
  );
}

// Old landings use the actual occupied position. A returning champion may already hold a different
// position in Main. Reusing the nominal link position there would clear an unrelated participant.
function seatOf(frame: Frame, receiver: HydratedMatchUp, input: Input) {
  const { edge, grant, source } = input;
  if (!grant.participant) return undefined;
  const sides = receiver.sides?.filter((side) => side.participantId === grant.participant);
  if (sides?.length !== 1) return undefined;
  const actual = sides[0].drawPosition;
  if (!actual || (source.structureId === receiver.structureId && actual !== grant.sourcePosition)) return undefined;
  return claimAssignment(frame, receiver, actual)?.participantId === grant.participant &&
    edge.receiver === receiver.matchUpId
    ? actual
    : undefined;
}

function placedSide(frame: Frame, m: HydratedMatchUp, input: Input, inputs: Input[]) {
  const { source, edge, grant } = input;
  const position = seatOf(frame, m, input) ?? (source.structureId !== m.structureId ? edge.position : undefined);
  if (position) return m.sides?.find((side) => side.drawPosition === position)?.sideNumber;
  if (grant.participant || edge.role !== 'winner' || source.structureId !== m.structureId) return undefined;
  const feeders = inputs.filter((i) => i.edge.role === 'winner' && i.source.structureId === m.structureId);
  if (
    feeders.length === 1 &&
    m.feedRound &&
    source.roundPosition === m.roundPosition &&
    source.roundNumber! + 1 === m.roundNumber
  )
    return 2;
  if (feeders.length !== 2 || !source.roundPosition || source.roundNumber! + 1 !== m.roundNumber) return undefined;
  const paired = feeders.find((i) => i.edge.source !== edge.source)?.source;
  if (!paired?.roundPosition || paired.roundPosition === source.roundPosition) return undefined;
  // Stored sides on an occupied receiver may have been re-keyed by position sorting.
  const opposite = m.sides?.find((s) => s.drawPosition && paired.drawPositions?.includes(s.drawPosition));
  if (opposite?.sideNumber) return 3 - opposite.sideNumber;
  return source.roundPosition < paired.roundPosition ? 1 : 2;
}

type Draft = {
  frame: Frame;
  target: HydratedMatchUp;
  previous: Input[];
  current: Input[];
  ops: OutcomeOp[];
  marks: SideExitProvenance;
  marksChanged: boolean;
  positions: Set<number>;
  assignments: Map<number, string | undefined>;
  removed?: number;
  added?: number;
};
type Change = { old: Input; next: Input };
function withdrawParticipant(d: Draft, { old, next }: Change) {
  const pid = old.grant.participant;
  if (!pid || pid === next.grant.participant) return;
  const actual = seatOf(d.frame, d.target, old);
  if (!actual || d.current.some((i) => i.grant.participant === pid && seatOf(d.frame, d.target, i) === actual)) return;
  if (!d.positions.has(actual) || d.assignments.has(actual)) return;
  if (checkScoreHasValue({ score: d.target.score })) return 'independent-score';
  if (old.source.structureId === d.target.structureId) {
    d.positions.delete(actual);
    d.removed = actual;
  } else {
    d.ops.push({ op: 'clearPosition', structureId: d.target.structureId, drawPosition: actual, participantId: pid });
    d.assignments.set(actual, undefined);
  }
  return undefined;
}
function reviseReservation(d: Draft, { old, next }: Change) {
  if (old.grant.reserved === next.grant.reserved) return;
  const { structureId, matchUpId } = d.target;
  const pos = next.edge.position;
  if (!pos) return 'unmapped-reservation';
  const seat = claimAssignment(d.frame, d.target, pos);
  if (!seat) return 'missing-reservation-slot';
  if (!next.grant.reserved) {
    if (!seat.byeFromPropagation || !seat.bye || d.current.some((i) => i.grant.reserved && i.edge.position === pos))
      return;
    d.ops.push({ op: 'withdrawBye', structureId, drawPosition: pos });
    if (d.target.matchUpStatus === BYE && !d.target.sides?.some((s) => s.bye && s.drawPosition !== pos))
      d.ops.push({ op: 'clearMatchUpBye', matchUpId, drawPosition: pos });
  } else if (!seat.bye) {
    if (seat.participantId && !d.assignments.has(pos)) return 'occupied-reservation';
    d.ops.push({ op: 'assignBye', structureId, drawPosition: pos, byeFromPropagation: true });
    if (d.target.matchUpStatus === TO_BE_PLAYED) d.ops.push({ op: 'setMatchUpBye', matchUpId });
  }
  return undefined;
}
function placeParticipant(d: Draft, { old, next }: Change) {
  const pid = next.grant.participant;
  if (!pid || pid === old.grant.participant || seatOf(d.frame, d.target, next)) return;
  if (next.source.structureId === d.target.structureId) {
    if (!next.grant.sourcePosition || d.positions.size >= 2) return 'held-winner-arrival';
    d.added = next.grant.sourcePosition;
    d.positions.add(d.added);
    return;
  }
  const pos = next.edge.position;
  if (!pos) return 'unmapped-arrival';
  const seat = claimAssignment(d.frame, d.target, pos);
  const freed = d.ops.some((op) => op.op === 'withdrawBye' && op.drawPosition === pos);
  if (!seat || (seat.bye && !freed) || (d.assignments.get(pos) ?? (!d.assignments.has(pos) && seat.participantId)))
    return 'held-linked-arrival';
  d.ops.push({ op: 'assignPosition', structureId: d.target.structureId, drawPosition: pos, participantId: pid });
  d.assignments.set(pos, pid);
  return undefined;
}
function reviseMark(d: Draft, { old, next }: Change) {
  const id = next.edge.source;
  const oldSide = placedSide(d.frame, d.target, old, d.previous);
  const mark = oldSide && d.marks[oldSide];
  if (mark && mark.sourceMatchUpId === id) {
    if (
      (old.grant.participant && !seatOf(d.frame, d.target, old)) ||
      mark.previousMatchUpStatus !== old.source.matchUpStatus
    )
      return 'stale-source-marker';
    delete d.marks[oldSide];
    d.marksChanged = true;
  } else if (Object.values(d.marks).some((m) => m.sourceMatchUpId === id)) return 'unmapped-source-marker';
  if (!next.grant.mark) return;
  const side = placedSide(d.frame, d.target, next, d.current);
  if (!side || (d.marks[side] && d.marks[side].sourceMatchUpId !== id)) return 'competing-mark-side';
  d.marks[side] = next.grant.mark;
  d.marksChanged = true;
  return undefined;
}
function supported(d: Draft, key: string, mark: SideExitProvenanceEntry) {
  if (!carriedExitStatus(mark)) return true;
  const donors = d.current.filter((i) => {
    if (i.edge.source !== mark.sourceMatchUpId || i.source.matchUpStatus !== mark.previousMatchUpStatus) return false;
    if ((i.edge.role === 'loser') !== !!i.grant.participant) return false;
    if (
      i.grant.participant &&
      !seatOf(d.frame, d.target, i) &&
      d.assignments.get(i.edge.position ?? -1) !== i.grant.participant
    )
      return false;
    return placedSide(d.frame, d.target, i, d.current) === Number(key);
  });
  return donors.length === 1 || (!donors.length && holdsRelayedLoser(d.frame, d.target, Number(key), mark));
}
function rederive(d: Draft, assignmentChanged: boolean): Rule {
  const { target, marks, ops } = d;
  const id = target.matchUpId;
  const derived = deriveExitStateFromProvenance(marks);
  if (!d.marksChanged && !(assignmentChanged && derived)) return { ops, reasons: [] };
  if (checkScoreHasValue({ score: target.score })) return stop('independent-score');
  if (target.matchUpStatus === BYE) return { ops, reasons: ['bye-exit-relay'] };
  const wasProduced = Object.values(target.sideExitProvenance ?? {}).some((mark) => carriedExitStatus(mark));
  if (derived && !wasProduced && isAnyExit(target.matchUpStatus)) return stop('independently-entered-exit');
  if (derived) {
    if (!Object.entries(marks).every(([k, v]) => supported(d, k, v))) return stop('unverified-surviving-origin');
    const side = target.sides?.find((s) => s.sideNumber === derived.winningSide);
    const position = side?.drawPosition;
    const occupant = position && (d.assignments.has(position) ? d.assignments.get(position) : side?.participantId);
    const winner = occupant && d.positions.has(position!) ? (derived.winningSide as 1 | 2) : undefined;
    if (d.marksChanged || target.winningSide !== winner || target.matchUpStatus !== derived.matchUpStatus) {
      ops.push(
        {
          op: 'setMatchUpResult',
          matchUpId: id,
          matchUpStatus: derived.matchUpStatus,
          winningSide: winner,
          matchUpStatusCodes: deriveStatusCodes({ ...target, sideExitProvenance: marks }),
          stampsScoredTime: false,
        },
        { op: 'setSideExitProvenance', matchUpId: id, provenance: marks },
      );
    }
  } else if (wasProduced) {
    ops.push(...withdrawnExitReset(id, { keepsScoredTime: true }));
    if (Object.keys(marks).length) ops.push({ op: 'setSideExitProvenance', matchUpId: id, provenance: marks });
  } else if (d.marksChanged) ops.push({ op: 'setSideExitProvenance', matchUpId: id, provenance: marks });
  return { ops, reasons: [] };
}

/** Resolve all withdrawals and reservations before offering any replacement a seat. A refusal or
 * unknown owner abandons the local draft without folding a partial direction. */
export function reconcileReceiver(
  frame: Frame,
  target: HydratedMatchUp,
  previous: Input[],
  current: Input[],
  assignmentChanged: boolean,
  release?: ReturnType<typeof withdrawnAwardRelease>,
): Rule {
  const changes = current.flatMap((next, i) =>
    sameGrant(previous[i].grant, next.grant) ? [] : [{ old: previous[i], next }],
  );
  if (changes.some((c) => c.next.edge.shared)) return stop('shared-final-placement');
  const draft: Draft = {
    frame,
    target,
    previous,
    current,
    ops: [],
    marks: { ...getSideExitProvenance({ matchUp: target }) },
    marksChanged: false,
    positions: new Set((target.drawPositions ?? []).filter(Boolean)),
    assignments: new Map(),
  };
  for (const resolve of [withdrawParticipant, reviseReservation, placeParticipant, reviseMark]) {
    for (const change of changes) {
      const reason = resolve(draft, change);
      if (reason) return stop(reason);
    }
  }
  // The award that granted the onward seat was withdrawn. Only a proved old grant lost
  // by that particular holder can use the narrow release, after all live inputs were evaluated.
  if (
    release &&
    !draft.added &&
    draft.removed === release.position &&
    target.matchUpId === release.onward.matchUpId &&
    release.op.drawPositions.length === draft.positions.size &&
    release.op.drawPositions.every((position) => draft.positions.has(position)) &&
    changes.some(
      ({ old }) => old.edge.source === release.holder.matchUpId && old.grant.participant === release.participantId,
    )
  )
    draft.ops.push(release.op);
  else if (draft.removed || draft.added) {
    const placement: OutcomeOp = {
      op: 'setMatchUpDrawPositions',
      matchUpId: target.matchUpId,
      drawPositions: [...draft.positions].sort((a, b) => a - b),
      removedDrawPosition: draft.removed,
      placedDrawPosition: draft.added,
    };
    // A re-derived single exit first withdraws its former double-exit award, then
    // advances its newly awarded participant. The latter owns the final winner-slot shape.
    if (draft.added && !draft.removed && !Object.keys(draft.marks).length && changes.length === 1) {
      const { old, next } = changes[0];
      if (
        old.edge.role === 'winner' &&
        isDoubleExit(old.source.matchUpStatus) &&
        old.grant.mark &&
        isExit(next.source.matchUpStatus) &&
        next.grant.sourcePosition === draft.added
      ) {
        const reset = rederive(draft, assignmentChanged);
        if (!reset.reasons.length) reset.ops.push(placement);
        return reset;
      }
    }
    draft.ops.push(placement);
  }
  return rederive(draft, assignmentChanged);
}
