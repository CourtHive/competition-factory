import { deferInContextMatchUp, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getTopics } from '@Global/state/globalState';
import { applyOutcomeOps } from './ops';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type { BuildViewArgs } from './types';
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
 * own top-level structure stamped, `modifyMatchUpNotice`), and for the call's matchUp the `updateInContextMatchUp` a
 * subscriber receives, built when the notices are read, after the call has succeeded, and only for a subscriber
 * (CA, 2026-10-24: projection bounded to the changed node, never on an error).
 */
export function applyOwnedPlan({ args, ops }: { args: BuildViewArgs; ops: OutcomeOp[] }): ResultType {
  const { drawDefinition, tournamentRecord, event } = args;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const applied = applyOutcomeOps(drawDefinition, ops);
  if (applied.error) return { error: INVALID_VALUES, info: applied.error };

  const tournamentId = tournamentRecord?.tournamentId;
  const written = [
    ...new Set(
      ops.flatMap((op) => (op.op === 'setMatchUpResult' || op.op === 'setMatchUpDrawPositions' ? [op.matchUpId] : [])),
    ),
  ];
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
    modifyMatchUpNotice({
      context: 'modifyMatchUpScore',
      eventId: event?.eventId,
      drawDefinition,
      tournamentId,
      matchUp,
      event,
    });
  }
  return { ...SUCCESS };
}
