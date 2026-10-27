import { findMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { findReservationWork } from '@Mutate/matchUps/matchUpStatus/reconcileConsolationReservations';
import { findMisplacedProvenance } from '@Mutate/matchUps/matchUpStatus/reconcileProvenanceSides';
import { hasHeldExitWork } from '@Mutate/drawDefinitions/positionGovernor/doubleExitAdvancement';
import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { hasStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { findOwedByeAdvance } from '@Mutate/matchUps/matchUpStatus/reconcileByeAdvancements';
import { hasForwardWork } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { findOwedCarry } from '@Mutate/matchUps/matchUpStatus/reconcileCarriesPastByes';
import { matchUpIsScored } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { getDeciderSnapshot } from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Event, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { RETIRED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { WorkingView } from './overlay';
import type { OutcomeOp } from './ops';

/**
 * THE SETTLE PASSES' HAS-WORK PREDICATES (executor plan § 6 S2; F5 (a), CA 2026-10-19: mirror v1's passes, each skipped
 * when it has no work). Asked of the working view, the draw as the plan's ops leave it, after v1's write and before its
 * settle passes would run. In S2, v2 owns a call only if every predicate is false.
 *
 * A predicate is one of two kinds:
 *  - EXACT: the pass's own detector, exported from the pass and run on the working view, so the two cannot drift;
 *  - SCOPE: where the pass decides inside the writer that acts (`propagateConsolationBye`, the double-exit settles,
 *    the decider), the call's ops say whether it is in the pass's reach. True whenever it could have work.
 * A false true only makes S2 abstain; a false false is a miss, and the census tallies both per pass against v1's
 * per-pass write reports (`settleTelemetry`).
 *
 * The site names are `setMatchUpStatus`'s `observePass` sites.
 */
export type SettleSite =
  | 'settleExitOrigins'
  | 'reconcileConsolationReservations'
  | 'reconcileStaleExitOrigins'
  | 'reconcileCarriesPastByes'
  | 'settleHeldExits'
  | 'reconcileByeAdvancements'
  | 'reconcileMissedLinkAdvancements'
  | 'reconcileProvenanceSides'
  | 'reconcileDeciders'
  | 'settleForwardConsequences'
  | 'reconcileLinkAdvancements'
  | 'reconcileScoredTimes';

/** the marker a call's predictions are recorded under, so a call that predicts no work is still seen */
export const PREDICTED_CALL = '(call)';

type SettleWorkArgs = {
  /** the draw as the call found it, stored shape */
  drawDefinition: DrawDefinition;
  /** the call's one hydration of that draw */
  inContextDrawMatchUps: HydratedMatchUp[];
  propagateRetirementAsExit?: boolean;
  propagateExitStatus?: boolean;
  /** the call's matchUp has a loser link: the only way v1 propagates a single exit (`directLoser`) */
  loserLinked?: boolean;
  tournamentRecord?: Tournament;
  working: WorkingView;
  ops: OutcomeOp[];
  event?: Event;
};

/** the settle passes the working view says have work, in v1's order */
export function predictSettleWork(args: SettleWorkArgs): SettleSite[] {
  const { working, ops } = args;
  const view = working.inContextDrawMatchUps;
  const draw = working.drawDefinition;
  const map = working.matchUpsMap;
  const before = new Map(args.inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const results = ops.filter((op) => op.op === 'setMatchUpResult');
  const resultOn = (predicate: (matchUp?: HydratedMatchUp) => boolean) =>
    results.some((op) => predicate(before.get(op.matchUpId)));
  let stale: boolean | undefined;
  const staleOrigins = () =>
    (stale ??= hasStaleExitOrigins({ inContextDrawMatchUps: view, drawDefinition: draw, matchUpsMap: map }));

  const work: Record<SettleSite, () => boolean> = {
    // SCOPE: the double exits the call changes, and the stale origins the write leaves
    settleExitOrigins: () => resultOn((matchUp) => isDoubleExit(matchUp?.matchUpStatus)) || staleOrigins(),
    reconcileConsolationReservations: () =>
      !!findReservationWork({ inContextDrawMatchUps: view, drawDefinition: draw, matchUpsMap: map }).length,
    reconcileStaleExitOrigins: staleOrigins,
    reconcileCarriesPastByes: () =>
      !!findOwedCarry({ inContextDrawMatchUps: view, drawDefinition: draw, matchUpsMap: map }),
    settleHeldExits: () => hasHeldExitWork({ inContextDrawMatchUps: view, drawDefinition: draw, matchUpsMap: map }),
    reconcileByeAdvancements: () => !!findOwedByeAdvance(view),
    reconcileMissedLinkAdvancements: () =>
      !!findMissedLinkAdvancements({ inContextDrawMatchUps: view, drawDefinition: draw }).length,
    reconcileProvenanceSides: () => !!findMisplacedProvenance({ inContextDrawMatchUps: view, matchUpsMap: map }).length,
    // EXACT for the trigger: a final whose winner changes, or a decider the write moves
    reconcileDeciders: () => {
      const finalsBefore = getDeciderFinals(args.drawDefinition);
      const finalsAfter = getDeciderFinals(draw);
      const changed = [...finalsAfter].some(([matchUpId, winningSide]) => finalsBefore.get(matchUpId) !== winningSide);
      return (
        changed || JSON.stringify(getDeciderSnapshot(args.drawDefinition)) !== JSON.stringify(getDeciderSnapshot(draw))
      );
    },
    settleForwardConsequences: () =>
      hasForwardWork({
        inContextDrawMatchUps: view,
        matchUpsMap: map,
        propagateExitStatus: args.propagateExitStatus,
        tournamentRecord: args.tournamentRecord,
        drawDefinition: draw,
        event: args.event,
      }),
    reconcileLinkAdvancements: () =>
      !!draw.links?.length &&
      !!getUnearnedLinkAdvancements({ inContextDrawMatchUps: view, drawDefinition: draw }).length,
    reconcileScoredTimes: () =>
      map.drawMatchUps.some((matchUp) => !!matchUp.schedule?.scoredTime && !matchUpIsScored(matchUp)),
  };
  // an exit the call propagates (`propagateExitFrom`), which no local call does: every pass is in reach
  if (results.some((op) => propagatesExit(op.matchUpStatus, args))) return Object.keys(work) as SettleSite[];
  return (Object.keys(work) as SettleSite[]).filter((site) => work[site]());
}

/**
 * Whether v1 propagates the exit a call writes: a double exit always produces downstream; a single exit is carried only
 * across a loser link, and only when `propagateExitStatus` is on and the status is one that travels (`directLoser`'s
 * `validExitToPropagate`: WALKOVER and DEFAULTED, and RETIRED under `propagateRetirementAsExit`). Any other single exit
 * is directed as a played result and settles as one.
 */
function propagatesExit(matchUpStatus: MatchUpStatusUnion, args: SettleWorkArgs): boolean {
  if (isDoubleExit(matchUpStatus)) return true;
  if (!isExit(matchUpStatus)) return false;
  if (!args.propagateExitStatus || !args.loserLinked) return false;
  return matchUpStatus !== RETIRED || !!args.propagateRetirementAsExit;
}
