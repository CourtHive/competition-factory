import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { findStructure } from '@Acquire/findStructure';
import { getTopics } from '@Global/state/globalState';
import { applyOutcomeOps } from './ops';
import {
  deferInContextMatchUp,
  modifyMatchUpNotice,
  modifyPositionAssignmentsNotice,
} from '@Mutate/notifications/drawNotifications';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type { BuildViewArgs } from './types';
import type { PlanShape } from './plan';
import type { OutcomeOp } from './ops';

/**
 * The outcome pipeline, v2: APPLY (executor plan § 3.1 step 4, § 3.4; S2). A call v2 owns is written here and v1 is
 * not asked: the plan's ops are folded into the STORED draw by `applyOutcomeOps`, the one reducer the working view and
 * the `differential` shadow apply use, so what lands is what the plan said and what the shadow comparison has held equal
 * to v1's write (F3). Stamps are ops, and the reducer records each in the call's ledger, so the notices below, written
 * by v1's own notice functions, stamp nothing twice (F2 (i)).
 *
 * Nothing is refused here. Every refusal was decided before the first op (§ 2), and the same ops were folded into the
 * working view's copies before this ran, so an id they name is in the draw.
 *
 * THE NOTICES are v1's for the same write: a `modifyMatchUp` for each matchUp written (with the draw and the matchUp's
 * own top-level structure stamped, `modifyMatchUpNotice`), a `modifyPositionAssignments` for each structure a loser is
 * placed in (S3: the direction shape), and for each matchUp given a result (the call's, and a carried exit's landing,
 * S5) the `updateInContextMatchUp` a subscriber receives, built when the notices are read, after the call has succeeded, and only for a subscriber
 * (CA, 2026-10-24: projection bounded to the changed node, never on an error).
 */
export function applyOwnedPlan({
  shape,
  args,
  ops,
}: {
  args: BuildViewArgs;
  ops: OutcomeOp[];
  shape: PlanShape;
}): ResultType {
  const { drawDefinition, tournamentRecord, event } = args;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const applied = applyOutcomeOps(drawDefinition, ops);
  if (applied.error) return { error: INVALID_VALUES, info: applied.error };

  const tournamentId = tournamentRecord?.tournamentId;
  const writes = ops.flatMap((op) =>
    op.op === 'setMatchUpResult' ||
    op.op === 'setMatchUpDrawPositions' ||
    op.op === 'setMatchUpBye' ||
    op.op === 'setMatchUpStatusCodes' ||
    op.op === 'mergeSideExitProvenance' ||
    op.op === 'setSideExitProvenance' ||
    op.op === 'clearMatchUpBye' ||
    op.op === 'setSideLineUp' ||
    op.op === 'setOrderOfFinish' ||
    op.op === 'exchangeDrawPositions'
      ? [op.matchUpId]
      : [],
  );
  // each matchUp at its LAST score write for the in-context notice that write defers, and at its LAST write of any kind
  // for its `modifyMatchUp`: v1's notice buffer keeps a matchUp re-announced later in the call at that later place (a
  // double exit given a winner: the next matchUp unwound first, then the winner's arrival after the result; an unwind
  // under `doubleExitPropagateBye: false` writing a matchUp back twice, S6 tail), and only a score write defers an
  // in-context notice (a settle pass's write defers none: v1's `reconcileScoredTimes` announces the matchUp, not its
  // context)
  const scored = ops.flatMap((op) => (op.op === 'setMatchUpResult' && !op.announcedAs ? [op.matchUpId] : []));
  const written = [...new Set(scored.toReversed())].reverse();
  const announced = [...new Set(writes.toReversed())].reverse();
  // a matchUp given its result and then a position (that next matchUp): its last notice is the placement's
  const lastWrites = new Map(ops.flatMap((op) => ('matchUpId' in op ? [[op.matchUpId, op.op]] : [])));
  const placedLast = new Set(
    [...lastWrites].flatMap(([matchUpId, op]) => (op === 'setMatchUpDrawPositions' ? [matchUpId] : [])),
  );
  // a line given a finishing number by another line's write is announced as v1's `modifyMatchUpScore` announces it
  const resulted = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpResult' || op.op === 'setOrderOfFinish' ? [op.matchUpId] : [])),
  );
  const byes = new Set(ops.flatMap((op) => (op.op === 'setMatchUpBye' ? [op.matchUpId] : [])));
  // a loser taken back out: their matchUp's codes re-derived, announced as v1's `removeDirectedLoser` announces it
  const recoded = new Set(ops.flatMap((op) => (op.op === 'setMatchUpStatusCodes' ? [op.matchUpId] : [])));
  // a swap's relabel in a later round: v1's `exchangePathPositions` announces each matchUp as `swapWinnerLoser`
  const exchanged = new Set(ops.flatMap((op) => (op.op === 'exchangeDrawPositions' ? [op.matchUpId] : [])));
  // a carry recorded beside a BYE it passed: the BYE matchUp's state is not rewritten, so v1's `progressExitStatus`
  // announces the entry itself (`recordCarryBesideBye`)
  const relayed = new Set(ops.flatMap((op) => (op.op === 'mergeSideExitProvenance' ? [op.matchUpId] : [])));
  const { removed, unevented, untournamented, unbyed, settledResults } = noticeRules(ops);
  // a position advanced through a BYE a double exit placed: v1's `doubleExitAdvancement` announces it as `advanceWinner`
  const advanced = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye ? [op.matchUpId] : [])),
  );
  // an awardee's position released when the carry they were awarded is withdrawn: v1's `releaseAdvancedDrawPosition`,
  // with the event (S6 tail)
  const released = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpDrawPositions' && op.releasedDrawPosition ? [op.matchUpId] : [])),
  );
  const { advancedLast } = byeAndAdvance(ops);
  const stored = new Map(args.matchUpsMap?.drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const subscribed = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
  // every score write announces its matchUp in context to a subscriber, as v1's `modifyMatchUpScore` does: the call's
  // own, and a carried exit's on the matchUp it lands in (S5)
  for (const matchUpId of written) {
    if (!subscribed || !resulted.has(matchUpId) || !stored.has(matchUpId)) continue;
    const contextless = untournamented.has(matchUpId);
    const record = contextless ? undefined : tournamentRecord;
    deferInContextMatchUp({
      inContextMatchUp: () => getInContextMatchUp({ tournamentRecord: record, drawDefinition, matchUpId }),
      tournamentId: contextless ? undefined : tournamentId,
      matchUpId,
    });
  }
  const { settled } = namedWriters(ops);
  for (const matchUpId of announced) {
    const matchUp = stored.get(matchUpId);
    if (!matchUp) continue;
    // a removal's notice is built as v1's `removeSubsequentRoundsParticipant` builds it, whose caller passes no event;
    // unless a score write announces the matchUp after it (a result turned into a double exit: the exit it produces)
    const removedPosition = resulted.has(matchUpId) ? undefined : removed.get(matchUpId);
    const unbyedPosition = resulted.has(matchUpId) ? undefined : unbyed.get(matchUpId);
    // a settle pass's result write names the event and the tournament, whatever an earlier write of the matchUp in the
    // same call left out (a convergence re-derived past the produced exit's matchUp: contextless on the unwind, S6 tail)
    const settledWrite = settledResults.has(matchUpId);
    const noticeEvent =
      !settledWrite && (removedPosition || unbyedPosition || unevented.has(matchUpId)) ? undefined : event;
    modifyMatchUpNotice({
      // v1's writers name themselves: the call's result is `modifyMatchUpScore`'s, a winner's seat in the next matchUp
      // is `assignMatchUpDrawPosition`'s (`directWinner`), a FIRST_MATCHUP reservation's matchUp `setMatchUpStatusBye`'s
      context:
        settled.get(matchUpId) ??
        noticeContext(matchUpId, removedPosition, unbyedPosition, {
          resulted: placedLast.has(matchUpId) ? new Set<string>() : resulted,
          byes,
          recoded,
          exchanged,
          relayed,
          advanced,
          advancedLast,
          released,
        }),
      eventId: noticeEvent?.eventId,
      tournamentId: !settledWrite && (untournamented.has(matchUpId) || unbyedPosition) ? undefined : tournamentId,
      drawDefinition,
      matchUp,
      event: noticeEvent,
    });
  }
  announceAssignments({ ops, drawDefinition, tournamentId, event });
  const tieMatchUpResult = dualTallyResult(ops);
  // a winner's route returns the context `directParticipants` builds, a final's included, which carries something only
  // for an exit (S5): empty
  return shape === 'direction' ? { ...SUCCESS, context: {}, ...tieMatchUpResult } : { ...SUCCESS, ...tieMatchUpResult };
}

/**
 * A matchUp given a BYE and then another BYE or an advance through one in the same call (S6 tail): v1's notice buffer
 * keeps the LAST write's context and an EARLIER write's event (`preserveNoticeIdentity`). Whether the advance came last,
 * and whether an evented BYE came before a later write that names no event (an unfillable seat's BYE, an advance).
 */
function byeAndAdvance(ops: OutcomeOp[]): { advancedLast: Set<string>; eventKept: Set<string> } {
  const last = new Map<string, 'bye' | 'advance'>();
  const eventedBye = new Set<string>();
  const eventKept = new Set<string>();
  for (const op of ops) {
    if (op.op === 'setMatchUpBye') {
      last.set(op.matchUpId, 'bye');
      // a second BYE naming no event (the seat a produced exit leaves unfillable) keeps an earlier BYE's event
      if (op.announcesEvent === false && eventedBye.has(op.matchUpId)) eventKept.add(op.matchUpId);
      if (op.announcesEvent !== false) eventedBye.add(op.matchUpId);
    } else if (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye) {
      last.set(op.matchUpId, 'advance');
      if (!op.announcesEvent && eventedBye.has(op.matchUpId)) eventKept.add(op.matchUpId);
    }
  }
  const advancedLast = new Set([...last].flatMap(([matchUpId, kind]) => (kind === 'advance' ? [matchUpId] : [])));
  return { advancedLast, eventKept };
}

/**
 * Which notices v1 writes with no event, and with no tournament, read off the ops alone (S7): shared by
 * `applyOwnedPlan`, which writes them, and the differential (`plannedNotices`), which holds v1's notices to them
 */
function noticeRules(ops: OutcomeOp[]) {
  // a position taken back out of a later round: v1's `removeSubsequentRoundsParticipant` names the position, no event.
  // Not when the same write places one (a changed winner): v1 announces the placement after the removal, and the
  // notice buffer keeps the later of the two for the matchUp
  const removed = new Map(
    ops.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.removedDrawPosition && !op.placedDrawPosition
        ? [[op.matchUpId, op.removedDrawPosition]]
        : [],
    ),
  );
  // a placement v1 announces with no event or tournament (a produced exit's award, sent on by `doubleExitAdvancement`)
  const unevented = new Set(
    ops.flatMap((op) =>
      (op.op === 'setMatchUpDrawPositions' &&
        (op.announcesContext === false || (op.advancesThroughBye && !op.announcesEvent))) ||
      (op.op === 'setMatchUpResult' && op.announcesContext === false) ||
      (op.op === 'setMatchUpBye' && op.announcesEvent === false)
        ? [op.matchUpId]
        : [],
    ),
  );
  // and with no tournament either (a produced exit's award, #5875; an exit recorded beside a BYE and carried on)
  const untournamented = new Set(
    ops.flatMap((op) =>
      (op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpResult') && op.announcesContext === false
        ? [op.matchUpId]
        : [],
    ),
  );
  // a BYE an unwind withdraws: v1's `clearDrawPosition` names its position, with neither event nor tournament (S6)
  const unbyed = withdrawnByeNotices(ops);
  // an advance through a BYE names no event, but an evented BYE written before it keeps its event (`byeAndAdvance`)
  for (const matchUpId of byeAndAdvance(ops).eventKept) unevented.delete(matchUpId);
  // a team's line-up written with no event, unless a result written after it announces the matchUp (`namedWriters`)
  for (const matchUpId of namedWriters(ops).lineUpUnevented) unevented.add(matchUpId);
  // a settle pass's result write names the event and the tournament, whatever an earlier write of the matchUp left out
  const settledResults = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpResult' && op.announcedAs ? [op.matchUpId] : [])),
  );
  return { removed, unevented, untournamented, unbyed, settledResults };
}

/**
 * The matchUps and structures whose notices name no event (S7): a matchUp's where its position is removed or its BYE
 * withdrawn and no result announces it after (v1's `removeSubsequentRoundsParticipant`, `clearDrawPosition`), or
 * where v1's writer passes none; a structure's where nothing evented is placed in it (`announceAssignments`)
 */
export function eventlessNotices(ops: OutcomeOp[]): { matchUps: Set<string>; structures: Set<string> } {
  const { removed, unevented, unbyed, settledResults } = noticeRules(ops);
  const resulted = new Set(ops.flatMap((op) => (op.op === 'setMatchUpResult' ? [op.matchUpId] : [])));
  const matchUps = new Set(
    ops.flatMap((op) => {
      if (!('matchUpId' in op)) return [];
      const { matchUpId } = op;
      const unplaced = !resulted.has(matchUpId) && (removed.has(matchUpId) || unbyed.has(matchUpId));
      return !settledResults.has(matchUpId) && (unplaced || unevented.has(matchUpId)) ? [matchUpId] : [];
    }),
  );
  const structures = new Set(touchedStructures(ops).filter((structureId) => !eventedPlacement(ops, structureId)));
  return { matchUps, structures };
}

const placement = (op: OutcomeOp): op is Extract<OutcomeOp, { op: 'assignPosition' | 'assignBye' }> =>
  op.op === 'assignPosition' || op.op === 'assignBye';

/**
 * an op whose structure's assignments v1 announces: a placement, and a seat an unwind visits but for a BYE the round-1
 * loser cascade takes back, which v1 announces no assignments for (S6 tail). The writer and the differential's planned
 * notices share this one rule
 */
export const announcesAssignments = (
  op: OutcomeOp,
): op is Extract<OutcomeOp, { op: 'assignPosition' | 'assignBye' | 'withdrawBye' }> =>
  placement(op) || (op.op === 'withdrawBye' && op.announcesAssignments !== false);

/** each structure a placement or an unwind's seat visit touches, in the order the call first touches it */
const touchedStructures = (ops: OutcomeOp[]) => [
  ...new Set(ops.flatMap((op) => (announcesAssignments(op) ? [op.structureId] : []))),
];

/**
 * a structure whose assignments notice names the event: a placement in it announced with one, the buffer keeping an
 * earlier notice's event when a later one names none. A seat an unwind visits with nothing placed names none
 */
const eventedPlacement = (ops: OutcomeOp[], structureId: string) =>
  ops.some(
    (op) => placement(op) && op.structureId === structureId && !(op.op === 'assignBye' && op.announcesEvent === false),
  );

/**
 * A TEAM line's call returns its dual's tally as v1's `directParticipants` annotates it (`tieMatchUpResult`, S7): the
 * dual's score and the winner it decides, if it decides one; no winner removed, no tieFormat removed
 */
function dualTallyResult(ops: OutcomeOp[]) {
  const tally = ops.find((op) => op.op === 'setMatchUpResult' && op.dualTally);
  if (tally?.op !== 'setMatchUpResult' || tally.dualTally?.unreturned) return {};
  return {
    tieMatchUpResult: {
      ...SUCCESS,
      score: tally.score,
      removeWinningSide: false,
      ...(tally.winningSide ? { winningSide: tally.winningSide } : {}),
    },
  };
}

/**
 * The structures whose assignments the ops change: a loser placed across a link, or a reserved seat, announced once
 * (v1's `directLoser`, `assignDrawPositionBye`); and a seat an unwind visits (S6)
 */
function announceAssignments({
  drawDefinition,
  tournamentId,
  event,
  ops,
}: {
  drawDefinition: NonNullable<BuildViewArgs['drawDefinition']>;
  event: BuildViewArgs['event'];
  tournamentId?: string;
  ops: OutcomeOp[];
}) {
  // each structure once, where the call first touches it: the notice buffer keeps a structure's first notice in place
  // and takes a later one's payload over it (`preserveNoticeIdentity`), so an unwind's seat visit and the loser placed
  // after it in the same structure are one notice, at the visit (S6)
  for (const structureId of touchedStructures(ops)) {
    const { structure } = findStructure({ drawDefinition, structureId });
    if (!structure) continue;
    const placedIn = ops.some((op) => placement(op) && op.structureId === structureId);
    // a seat an unwind's `removeDirectedBye` visits, nothing placed in its structure: announced with neither event nor
    // tournament, whether or not a BYE stood there (S6)
    if (!placedIn) {
      modifyPositionAssignmentsNotice({ drawDefinition, structure, tournamentId: undefined, event: undefined });
      continue;
    }
    // a loser placed across a link, or a reserved seat (v1's `directLoser`, `assignDrawPositionBye`), with its event
    // where any placement in it is announced with one (`eventedPlacement`)
    const noticeEvent = eventedPlacement(ops, structureId) ? event : undefined;
    modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event: noticeEvent });
  }
}

/**
 * A BYE an unwind withdraws: v1's `clearDrawPosition` names its position, with neither event nor tournament (S6), unless
 * a seat is then advanced into the matchUp through a standing BYE, whose later notice v1's buffer keeps (S6 tail)
 */
function withdrawnByeNotices(ops: OutcomeOp[]): Map<string, number> {
  const unbyed = new Map<string, number>();
  for (const op of ops) {
    if (op.op === 'clearMatchUpBye') unbyed.set(op.matchUpId, op.drawPosition);
    if (op.op === 'setMatchUpDrawPositions' && op.withdrawnByePosition)
      unbyed.set(op.matchUpId, op.withdrawnByePosition);
    if (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye) unbyed.delete(op.matchUpId);
    // a BYE matchUp emptied by a release (`releaseAdvancedDrawPosition`'s vacated BYE): the release's notice is the last
    if (op.op === 'setMatchUpDrawPositions' && op.releasedDrawPosition) unbyed.delete(op.matchUpId);
  }
  return unbyed;
}

function noticeContext(
  matchUpId: string,
  removedPosition: number | undefined,
  unbyedPosition: number | undefined,
  written: Parameters<typeof matchUpContext>[1],
): string {
  if (removedPosition) return `removeSubsequentDrawPosition-${removedPosition}`;
  if (unbyedPosition) return `removeDrawPosition-${unbyedPosition}`;
  return matchUpContext(matchUpId, written);
}

function matchUpContext(
  matchUpId: string,
  written: {
    resulted: Set<string>;
    byes: Set<string>;
    recoded: Set<string>;
    exchanged: Set<string>;
    relayed: Set<string>;
    advanced: Set<string>;
    advancedLast: Set<string>;
    released: Set<string>;
  },
): string {
  const { resulted, byes, recoded, exchanged, relayed, advanced, advancedLast, released } = written;
  if (resulted.has(matchUpId)) return 'modifyMatchUpScore';
  // a BYE and an advance through one: the later write's context (`byeAndAdvance`)
  if (advanced.has(matchUpId) && (!byes.has(matchUpId) || advancedLast.has(matchUpId))) return 'advanceWinner';
  if (released.has(matchUpId)) return 'releaseAdvancedDrawPosition';
  if (relayed.has(matchUpId)) return 'progressExitStatus';
  // a loser taken back out and their seat then given a BYE (a result turned into a double exit): the BYE is the later
  if (recoded.has(matchUpId) && byes.has(matchUpId)) return 'setMatchUpStatusBye';
  if (recoded.has(matchUpId)) return 'removeDirectedLoser';
  if (exchanged.has(matchUpId)) return 'swapWinnerLoser';
  return byes.has(matchUpId) ? 'setMatchUpStatusBye' : 'assignMatchUpDrawPosition';
}

/**
 * The writers v1's notices name where they are not the matchUp's result: a settle pass's write (a withdrawn carry,
 * `reconcileScoredTimes`) and a team's line-up carried on (`directWinner`, `directLoser`) or written at its assignment
 * (`updateSidLineUp`, with no event where `assignTeamLineUp` hands it none). A matchUp's notice is its last writer's: a
 * result written after a line-up (a dual's exit carried onto the dual its losing team reached, whose own call writes it)
 * announces the matchUp as the result does (S7).
 */
function namedWriters(ops: OutcomeOp[]) {
  const settled = new Map<string, string>();
  const lineUpUnevented = new Set<string>();
  for (const op of ops) {
    if (op.op === 'setSideLineUp') {
      settled.set(op.matchUpId, op.announcedAs);
      if (op.announcesEvent === false) lineUpUnevented.add(op.matchUpId);
    } else if (op.op === 'setMatchUpResult') {
      if (op.announcedAs) settled.set(op.matchUpId, op.announcedAs);
      else settled.delete(op.matchUpId);
      lineUpUnevented.delete(op.matchUpId);
    }
  }
  return { settled, lineUpUnevented };
}
