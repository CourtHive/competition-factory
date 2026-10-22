import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { carriedExitStatus, getSideExitProvenance } from './sideExitProvenance';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';

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
 * exit is owed it too: one side holds the exit, which is the side that will lose. Whether the seat is owed is
 * `propagateUnfillableLoserBye`'s own test: one exited side, the losing one, a connected structure, an empty seat. The
 * claim names the double exit that produced the kept exit (`producingDoubleExit`), as forward play records it.
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
  for (const matchUpId of doubleExitsBefore) {
    const matchUp = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
    // `isExit` is a single exit: a matchUp still converged is not owed anything
    if (!matchUp || !isExit(matchUp.matchUpStatus)) continue;
    const owed = propagateUnfillableLoserBye({
      claimantMatchUpId: producingDoubleExit({ matchUp, matchUpsMap }),
      pendingExit: !matchUp.winningSide,
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
 * The double exit whose PRODUCED exit the matchUp's one exited side holds, if it is one. Forward play claims the BYE that
 * produced exit owes on the double exit's account (`advanceByeToLoserMatchUp`), never on the matchUp it was produced
 * into, so a dissolved convergence re-owing that BYE claims it the same way; a CARRIED exit's award claims as itself (P39).
 */
export function producingDoubleExit({
  matchUpsMap,
  matchUp,
}: {
  matchUpsMap: MatchUpsMap;
  matchUp: MatchUp;
}): string | undefined {
  const provenance = getSideExitProvenance({ matchUp }) ?? {};
  const exited = ([1, 2] as const).filter((sideNumber) => carriedExitStatus(provenance[sideNumber]));
  if (exited.length !== 1) return undefined;
  const sourceMatchUpId = provenance[exited[0]]?.sourceMatchUpId;
  const origin = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === sourceMatchUpId);
  return origin && isDoubleExit(origin.matchUpStatus) ? origin.matchUpId : undefined;
}
