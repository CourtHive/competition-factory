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
 * placed in (S3: the direction shape), and for the call's matchUp the `updateInContextMatchUp` a
 * subscriber receives, built when the notices are read, after the call has succeeded, and only for a subscriber
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
        op.op === 'setMatchUpResult' || op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpBye'
          ? [op.matchUpId]
          : [],
      ),
    ),
  ];
  const resulted = new Set(ops.flatMap((op) => (op.op === 'setMatchUpResult' ? [op.matchUpId] : [])));
  const byes = new Set(ops.flatMap((op) => (op.op === 'setMatchUpBye' ? [op.matchUpId] : [])));
  // a position taken back out of a later round: v1's `removeSubsequentRoundsParticipant` names the position, no event
  const removed = new Map(
    ops.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.removedDrawPosition ? [[op.matchUpId, op.removedDrawPosition]] : [],
    ),
  );
  const stored = new Map(args.matchUpsMap?.drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const subscribed = getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP);
  for (const matchUpId of written) {
    const matchUp = stored.get(matchUpId);
    if (!matchUp) continue;
    if (subscribed && matchUpId === args.request.matchUpId)
      deferInContextMatchUp({
        inContextMatchUp: () => getInContextMatchUp({ tournamentRecord, drawDefinition, matchUpId }),
        tournamentId,
        matchUpId,
      });
    // a removal's notice is built as v1's `removeSubsequentRoundsParticipant` builds it, whose caller passes no event
    const removedPosition = removed.get(matchUpId);
    const noticeEvent = removedPosition ? undefined : event;
    modifyMatchUpNotice({
      // v1's writers name themselves: the call's result is `modifyMatchUpScore`'s, a winner's seat in the next matchUp
      // is `assignMatchUpDrawPosition`'s (`directWinner`), a FIRST_MATCHUP reservation's matchUp `setMatchUpStatusBye`'s
      context: removedPosition
        ? `removeSubsequentDrawPosition-${removedPosition}`
        : matchUpContext(matchUpId, resulted, byes),
      eventId: noticeEvent?.eventId,
      drawDefinition,
      tournamentId,
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

function matchUpContext(matchUpId: string, resulted: Set<string>, byes: Set<string>): string {
  if (resulted.has(matchUpId)) return 'modifyMatchUpScore';
  return byes.has(matchUpId) ? 'setMatchUpStatusBye' : 'assignMatchUpDrawPosition';
}
