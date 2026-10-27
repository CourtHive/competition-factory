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
  const written = [
    ...new Set(
      ops.flatMap((op) =>
        op.op === 'setMatchUpResult' ||
        op.op === 'setMatchUpDrawPositions' ||
        op.op === 'setMatchUpBye' ||
        op.op === 'setMatchUpStatusCodes' ||
        op.op === 'mergeSideExitProvenance' ||
        op.op === 'exchangeDrawPositions'
          ? [op.matchUpId]
          : [],
      ),
    ),
  ];
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
    ops.flatMap((op) => (op.op === 'setMatchUpDrawPositions' && op.announcesContext === false ? [op.matchUpId] : [])),
  );
  const stored = new Map(args.matchUpsMap?.drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const subscribed = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
  for (const matchUpId of written) {
    const matchUp = stored.get(matchUpId);
    if (!matchUp) continue;
    // every score write announces its matchUp in context to a subscriber, as v1's `modifyMatchUpScore` does: the call's
    // own, and a carried exit's on the matchUp it lands in (S5)
    if (subscribed && resulted.has(matchUpId))
      deferInContextMatchUp({
        inContextMatchUp: () => getInContextMatchUp({ tournamentRecord, drawDefinition, matchUpId }),
        tournamentId,
        matchUpId,
      });
    // a removal's notice is built as v1's `removeSubsequentRoundsParticipant` builds it, whose caller passes no event
    const removedPosition = removed.get(matchUpId);
    const noticeEvent = removedPosition || unevented.has(matchUpId) ? undefined : event;
    modifyMatchUpNotice({
      // v1's writers name themselves: the call's result is `modifyMatchUpScore`'s, a winner's seat in the next matchUp
      // is `assignMatchUpDrawPosition`'s (`directWinner`), a FIRST_MATCHUP reservation's matchUp `setMatchUpStatusBye`'s
      context: removedPosition
        ? `removeSubsequentDrawPosition-${removedPosition}`
        : matchUpContext(matchUpId, { resulted, byes, recoded, exchanged, relayed }),
      eventId: noticeEvent?.eventId,
      tournamentId: unevented.has(matchUpId) ? undefined : tournamentId,
      drawDefinition,
      matchUp,
      event: noticeEvent,
    });
  }
  // a loser placed across a link, or a reserved seat: the structure whose assignments changed, announced once (v1's
  // `directLoser`, `assignDrawPositionBye`)
  const placedIn = [
    ...new Set(ops.flatMap((op) => (op.op === 'assignPosition' || op.op === 'assignBye' ? [op.structureId] : []))),
  ];
  for (const structureId of placedIn) {
    const { structure } = findStructure({ drawDefinition, structureId });
    if (structure) modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event });
  }
  // a winner's route returns the context `directParticipants` builds, a final's included, which carries something only
  // for an exit (S5): empty
  return shape === 'direction' ? { ...SUCCESS, context: {} } : { ...SUCCESS };
}

function matchUpContext(
  matchUpId: string,
  written: {
    resulted: Set<string>;
    byes: Set<string>;
    recoded: Set<string>;
    exchanged: Set<string>;
    relayed: Set<string>;
  },
): string {
  const { resulted, byes, recoded, exchanged, relayed } = written;
  if (resulted.has(matchUpId)) return 'modifyMatchUpScore';
  if (relayed.has(matchUpId)) return 'progressExitStatus';
  if (recoded.has(matchUpId)) return 'removeDirectedLoser';
  if (exchanged.has(matchUpId)) return 'swapWinnerLoser';
  return byes.has(matchUpId) ? 'setMatchUpStatusBye' : 'assignMatchUpDrawPosition';
}
