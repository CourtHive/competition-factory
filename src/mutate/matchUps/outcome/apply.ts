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
    op.op === 'exchangeDrawPositions'
      ? [op.matchUpId]
      : [],
  );
  // each matchUp at its FIRST score write for the in-context notice that write defers, and at its LAST write for its
  // `modifyMatchUp`: v1's notice buffer keeps a matchUp re-announced later in the call at that later place (a double exit
  // given a winner: the next matchUp unwound first, then the winner's arrival after the result), and only a score write
  // defers an in-context notice
  // (a settle pass's write defers none: v1's `reconcileScoredTimes` announces the matchUp, not its context)
  const written = [
    ...new Set(ops.flatMap((op) => (op.op === 'setMatchUpResult' && !op.announcedAs ? [op.matchUpId] : []))),
  ];
  const announced = [...new Set(writes.toReversed())].reverse();
  // a matchUp given its result and then a position (that next matchUp): its last notice is the placement's
  const lastWrites = new Map(ops.flatMap((op) => ('matchUpId' in op ? [[op.matchUpId, op.op]] : [])));
  const placedLast = new Set(
    [...lastWrites].flatMap(([matchUpId, op]) => (op === 'setMatchUpDrawPositions' ? [matchUpId] : [])),
  );
  const resulted = new Set(ops.flatMap((op) => (op.op === 'setMatchUpResult' ? [op.matchUpId] : [])));
  const byes = new Set(ops.flatMap((op) => (op.op === 'setMatchUpBye' ? [op.matchUpId] : [])));
  // a loser taken back out: their matchUp's codes re-derived, announced as v1's `removeDirectedLoser` announces it
  const recoded = new Set(ops.flatMap((op) => (op.op === 'setMatchUpStatusCodes' ? [op.matchUpId] : [])));
  // a swap's relabel in a later round: v1's `exchangePathPositions` announces each matchUp as `swapWinnerLoser`
  const exchanged = new Set(ops.flatMap((op) => (op.op === 'exchangeDrawPositions' ? [op.matchUpId] : [])));
  // a carry recorded beside a BYE it passed: the BYE matchUp's state is not rewritten, so v1's `progressExitStatus`
  // announces the entry itself (`recordCarryBesideBye`)
  const relayed = new Set(ops.flatMap((op) => (op.op === 'mergeSideExitProvenance' ? [op.matchUpId] : [])));
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
      (op.op === 'setMatchUpDrawPositions' && (op.announcesContext === false || op.advancesThroughBye)) ||
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
  // a position advanced through a BYE a double exit placed: v1's `doubleExitAdvancement` announces it as `advanceWinner`
  const advanced = new Set(
    ops.flatMap((op) => (op.op === 'setMatchUpDrawPositions' && op.advancesThroughBye ? [op.matchUpId] : [])),
  );
  // a BYE an unwind withdraws: v1's `clearDrawPosition` names its position, with neither event nor tournament (S6)
  const unbyed = new Map<string, number>();
  for (const op of ops) {
    if (op.op === 'clearMatchUpBye') unbyed.set(op.matchUpId, op.drawPosition);
    if (op.op === 'setMatchUpDrawPositions' && op.withdrawnByePosition)
      unbyed.set(op.matchUpId, op.withdrawnByePosition);
  }
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
  // a write v1's settle pass makes, announced under that pass's name (a withdrawn carry, `reconcileScoredTimes`)
  // and a decided dual's winning team carries its line-up into the next dual last, announced by `directWinner` (S7)
  const settled = new Map<string, string>(
    ops.flatMap((op): [string, string][] => {
      if (op.op === 'setSideLineUp') return [[op.matchUpId, 'directWinner']];
      return op.op === 'setMatchUpResult' && op.announcedAs ? [[op.matchUpId, op.announcedAs]] : [];
    }),
  );
  for (const matchUpId of announced) {
    const matchUp = stored.get(matchUpId);
    if (!matchUp) continue;
    // a removal's notice is built as v1's `removeSubsequentRoundsParticipant` builds it, whose caller passes no event;
    // unless a score write announces the matchUp after it (a result turned into a double exit: the exit it produces)
    const removedPosition = resulted.has(matchUpId) ? undefined : removed.get(matchUpId);
    const unbyedPosition = resulted.has(matchUpId) ? undefined : unbyed.get(matchUpId);
    const noticeEvent = removedPosition || unbyedPosition || unevented.has(matchUpId) ? undefined : event;
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
        }),
      eventId: noticeEvent?.eventId,
      tournamentId: untournamented.has(matchUpId) || unbyedPosition ? undefined : tournamentId,
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
 * A TEAM line's call returns its dual's tally as v1's `directParticipants` annotates it (`tieMatchUpResult`, S7): the
 * dual's score and the winner it decides, if it decides one; no winner removed, no tieFormat removed
 */
function dualTallyResult(ops: OutcomeOp[]) {
  const tally = ops.find((op) => op.op === 'setMatchUpResult' && op.dualTally);
  if (tally?.op !== 'setMatchUpResult') return {};
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
  const placement = (op: OutcomeOp): op is Extract<OutcomeOp, { op: 'assignPosition' | 'assignBye' }> =>
    op.op === 'assignPosition' || op.op === 'assignBye';
  const touched = [...new Set(ops.flatMap((op) => (placement(op) || op.op === 'withdrawBye' ? [op.structureId] : [])))];
  for (const structureId of touched) {
    const { structure } = findStructure({ drawDefinition, structureId });
    if (!structure) continue;
    const placedIn = ops.some((op) => placement(op) && op.structureId === structureId);
    // a seat an unwind's `removeDirectedBye` visits, nothing placed in its structure: announced with neither event nor
    // tournament, whether or not a BYE stood there (S6)
    if (!placedIn) {
      modifyPositionAssignmentsNotice({ drawDefinition, structure, tournamentId: undefined, event: undefined });
      continue;
    }
    // a loser placed across a link, or a reserved seat (v1's `directLoser`, `assignDrawPositionBye`): with its event
    // where any placement in it is announced with one, the buffer keeping an earlier notice's event when a later one
    // names none
    const evented = ops.some(
      (op) =>
        placement(op) && op.structureId === structureId && !(op.op === 'assignBye' && op.announcesEvent === false),
    );
    const noticeEvent = evented ? event : undefined;
    modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event: noticeEvent });
  }
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
  },
): string {
  const { resulted, byes, recoded, exchanged, relayed, advanced } = written;
  if (resulted.has(matchUpId)) return 'modifyMatchUpScore';
  if (advanced.has(matchUpId) && !byes.has(matchUpId)) return 'advanceWinner';
  if (relayed.has(matchUpId)) return 'progressExitStatus';
  // a loser taken back out and their seat then given a BYE (a result turned into a double exit): the BYE is the later
  if (recoded.has(matchUpId) && byes.has(matchUpId)) return 'setMatchUpStatusBye';
  if (recoded.has(matchUpId)) return 'removeDirectedLoser';
  if (exchanged.has(matchUpId)) return 'swapWinnerLoser';
  return byes.has(matchUpId) ? 'setMatchUpStatusBye' : 'assignMatchUpDrawPosition';
}
