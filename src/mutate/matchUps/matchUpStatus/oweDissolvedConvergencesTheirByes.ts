import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { carriedExitStatus, getSideExitProvenance } from './sideExitProvenance';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * A CONVERGENCE THIS CALL DISSOLVED IS OWED THE BYE IT TOOK BACK, asked of the settled draw.
 *
 * Under `doubleExitPropagateBye: false` a single exit that becomes a double exit gives up the BYE its loser seat held on
 * its account (`reclaimSingleExitBye`). Re-derived to an awarded single exit, it has nobody to lose again, so the seat is
 * owed that BYE. Two dissolving paths already re-owe it (`settleRederivedDoubleExit` #5519, `removeDoubleExit`); a third,
 * a double exit re-derived by a withdrawn exit (`applyWithdrawnExits`), did not. Census Phase B, COMPASS 32/30
 * policy-off 30004303: clearing `East|1|7` dissolved `West|1|4`'s double walkover, `South|1|2` dp 4 stayed empty, and
 * `South|1|2` read DEFAULTED where forward play has a BYE.
 *
 * Asked once the call has settled, of the matchUps that were double exits before it and are single exits now, awarded
 * or still pending, never mid-call: a convergence can be re-derived and converge again within one call, and a BYE placed
 * in between kept the transient single exit's claim (census 20551581, `aLoserSeatHoldingAByeIsNotConverged`). Since CA
 * ruling (A) (2026-10-21) every policy-off convergence gives its seat's BYE way to the produced exit, so a pending single
 * exit is owed it too where forward play gives a pending exit one: where a double exit produced the exit straight into
 * the matchUp (`conditionallyAdvanceDrawPosition`). An exit relayed past a BYE leaves its pending matchUp's seat empty
 * until the exit is awarded, so a convergence it dissolves back to is owed nothing (census openings policy-off, COMPASS
 * 16/13 21078668 and nineteen siblings: the clear of a probe that converged `West|2|2` left `Southwest|1|1` a BYE the
 * schedule never had). Whether the seat is owed is `propagateUnfillableLoserBye`'s own test: one exited side, the losing
 * one, a connected structure, an empty seat. The claim names the double exit that produced the kept exit straight into
 * the matchUp, as forward play records it, and otherwise the matchUp itself (`producingDoubleExit`).
 */
export function oweDissolvedConvergencesTheirByes({
  doubleExitsBefore,
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  doubleExitsBefore: Set<string>;
  event?: Event;
}): ResultType | undefined {
  if (!doubleExitsBefore.size) return undefined;
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  let inContextDrawMatchUps: HydratedMatchUp[] | undefined;
  for (const matchUpId of doubleExitsBefore) {
    const matchUp = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
    // `isExit` is a single exit: a matchUp still converged is not owed anything
    if (!matchUp || !isExit(matchUp.matchUpStatus)) continue;
    inContextDrawMatchUps ??= getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps ?? [];
    const claimantMatchUpId = producingDoubleExit({ matchUp, matchUpsMap, drawDefinition, inContextDrawMatchUps });
    // a pending exit's seat holds a BYE in forward play only where a double exit produced the exit straight into it
    // (`conditionallyAdvanceDrawPosition`); one relayed past a BYE leaves the seat empty until the exit is awarded
    const pendingExit = !matchUp.winningSide;
    if (pendingExit && !claimantMatchUpId) continue;
    const owed = propagateUnfillableLoserBye({
      claimantMatchUpId,
      pendingExit,
      claimStandingBye: true,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      matchUpId,
      event,
    });
    if (owed?.error) return owed;
  }
  return undefined;
}

/**
 * The double exit whose PRODUCED exit the matchUp's one exited side holds, when it produced that exit straight into this
 * matchUp over its winner or loser link. Forward play claims the BYE that produced exit owes on the double exit's account
 * (`conditionallyAdvanceDrawPosition` → `advanceByeToLoserMatchUp`), never on the matchUp it was produced into, so a
 * dissolved convergence re-owing that BYE claims it the same way. An exit relayed past a BYE is awarded and claims as the
 * matchUp it decides (`propagateUnfillableLoserBye`), as a CARRIED exit's award does (P39): `undefined` for both (census
 * policy-off COMPASS 16/11 21146979: `West|2|2`'s BYE in `Southwest|1|1` was claimed by `East|1|5`, whose walkover was
 * relayed past `West|1|3`'s BYE, and clearing `East|1|5` left it standing).
 */
export function producingDoubleExit({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpsMap,
  matchUp,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  matchUp: MatchUp;
}): string | undefined {
  const provenance = getSideExitProvenance({ matchUp }) ?? {};
  const exited = ([1, 2] as const).filter((sideNumber) => carriedExitStatus(provenance[sideNumber]));
  if (exited.length !== 1) return undefined;
  const sourceMatchUpId = provenance[exited[0]]?.sourceMatchUpId;
  const origin = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === sourceMatchUpId);
  if (!origin || !isDoubleExit(origin.matchUpStatus)) return undefined;
  return producedStraightInto({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpsMap,
    originMatchUpId: origin.matchUpId,
    matchUpId: matchUp.matchUpId,
  })
    ? origin.matchUpId
    : undefined;
}

/** the origin's winner or loser link targets the matchUp itself: its exit was not relayed past a BYE on the way */
export function producedStraightInto({
  inContextDrawMatchUps,
  originMatchUpId,
  drawDefinition,
  matchUpsMap,
  matchUpId,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  originMatchUpId: string;
  matchUpId: string;
}): boolean {
  const matchUps =
    inContextDrawMatchUps ?? getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps;
  const origin = matchUps?.find((candidate) => candidate.matchUpId === originMatchUpId);
  return !!origin && (origin.winnerMatchUpId === matchUpId || origin.loserMatchUpId === matchUpId);
}
