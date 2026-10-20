import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

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
 * Asked once the call has settled, of the matchUps that were double exits before it and are single awarded exits now,
 * never mid-call: a convergence can be re-derived and converge again within one call, and a BYE placed in between kept
 * the transient single exit's claim (census 20551581, `aLoserSeatHoldingAByeIsNotConverged`). Whether the seat is owed
 * is `propagateUnfillableLoserBye`'s own test: one exited side, the losing one, a connected structure, an empty seat.
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
    if (!matchUp?.winningSide || !isExit(matchUp.matchUpStatus)) continue;
    const owed = propagateUnfillableLoserBye({ tournamentRecord, drawDefinition, matchUpsMap, matchUpId, event });
    if (owed?.error) return owed;
  }
  return undefined;
}
