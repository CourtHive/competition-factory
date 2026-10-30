import { releaseAdvancedDrawPositionAcrossLinks } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { setMatchUpDrawPositions } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import {
  deriveExitStateFromProvenance,
  clearSideExitProvenance,
  setSideExitProvenance,
  getSideExitProvenance,
  carriedExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * THE BYE STAYS; THE EXIT TRAVELS. A seat that advanced structurally while EMPTY, and then became a propagated BYE,
 * left its position one round on, where the target recorded a BYE arriving from the holder. A BYE goes nowhere (CA,
 * 2026-09-20: "the BYE remains a BYE"; 2026-10-04: "BYE holder, exit sent on"), so when the exit the holder held is
 * sent on, the holder's BYE position is taken back out of the target first, and the target reads again as what the
 * other side left it: a pending exit, or nothing. Matrix cell 337 (FEED_IN_CHAMPIONSHIP_TO_SF 16/16): `Consolation|4|2`'s
 * dp2 stood in `5|1` as a BYE arrival; the WALKOVER sent on then met the WALKOVER `4|1`'s double exit produced there,
 * instead of being lost, and the convergence produced onward with no phantom seat to award.
 *
 * Returns the target as it stands afterwards (the stored matchUp), or undefined when there was nothing to release.
 */
export function releaseHoldersByeFromTarget({
  arrivalSideNumber,
  nextWinnerMatchUp,
  drawDefinition,
  fromMatchUp,
  matchUpsMap,
  params,
}: {
  params: { tournamentRecord?: Tournament; event?: Event };
  nextWinnerMatchUp: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  fromMatchUp: HydratedMatchUp;
  arrivalSideNumber: number;
  matchUpsMap: MatchUpsMap;
}): MatchUp | undefined {
  const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === nextWinnerMatchUp.matchUpId);
  if (!stored || fromMatchUp.structureId !== nextWinnerMatchUp.structureId) return undefined;
  const { positionAssignments } = getPositionAssignments({ structureId: fromMatchUp.structureId, drawDefinition });
  const holdersBye = (fromMatchUp.drawPositions ?? []).find(
    (position) =>
      position &&
      positionAssignments?.some((assignment) => assignment.drawPosition === position && assignment.bye) &&
      stored.drawPositions?.includes(position),
  );
  if (!holdersBye) return undefined;

  setMatchUpDrawPositions({
    drawPositions: (stored.drawPositions ?? []).map((position) => (position === holdersBye ? undefined : position)),
    structureId: fromMatchUp.structureId,
    matchUp: stored,
    drawDefinition,
  });
  const provenance = { ...getSideExitProvenance({ matchUp: stored }) };
  const arrival = provenance[arrivalSideNumber];
  if (arrival?.matchUpStatus === BYE && !carriedExitStatus(arrival)) delete provenance[arrivalSideNumber];
  clearSideExitProvenance(stored);
  if (Object.keys(provenance).length) setSideExitProvenance({ matchUp: stored, provenance });
  // what the other side left: a pending exit, or nothing
  const derived = deriveExitStateFromProvenance(getSideExitProvenance({ matchUp: stored }));
  stored.matchUpStatus = derived?.matchUpStatus ?? TO_BE_PLAYED;
  delete stored.winningSide;
  // AND WHOEVER PASSED THAT BYE COMES BACK WITH IT, as for any BYE position released from a matchUp
  // (`releaseAdvancedDrawPositionAcrossLinks`, `vacatedByes`). Standing opposite the other seat, the BYE made the target a
  // BYE matchUp, and its occupant went on through it carrying their exit (RULE 1). The target now has no winner, so that
  // advance had no result behind it. Census F2, FEED_IN_CHAMPIONSHIP_TO_SF 16/16 (20501324): Jane, carrying a default,
  // passed the BYE in `Consolation|3|1` into `4|1`; the held exit took the seat back and the two exits converged, but she
  // stayed in `4|1`, and the correction that later re-derived `3|1` was refused placing its real winner there.
  // the holder's BYE position itself may have gone on past the target, which was held by a BYE as well: it leaves every
  // round it reached, so the matchUp beyond receives one position from that feeder (census s14 FIRST_MATCH_LOSER_CONSOLATION
  // 16/14 and 16/13, 20515211 and 20532322: `Consolation|2|2`'s BYE stood in `4|1` beside the participant who passed it)
  const released = [holdersBye, ...(stored.drawPositions ?? [])];
  for (const drawPosition of released.filter((position): position is number => !!position)) {
    releaseAdvancedDrawPositionAcrossLinks({
      clearDrawPosition,
      fromRoundNumber: (nextWinnerMatchUp.roundNumber ?? 0) + 1,
      structureId: fromMatchUp.structureId,
      tournamentRecord: params.tournamentRecord,
      passedByeReleased: true,
      withdrawingExit: true,
      event: params.event,
      drawDefinition,
      drawPosition,
      matchUpsMap,
    });
  }
  modifyMatchUpNotice({
    tournamentId: params.tournamentRecord?.tournamentId,
    context: 'releaseHoldersByeFromTarget',
    eventId: params.event?.eventId,
    matchUp: stored,
    drawDefinition,
  });
  return stored;
}
