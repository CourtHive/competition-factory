import { getSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { withdrawByeSeats } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { awardStands } from './positionClear';
import { isExit } from '@Validators/isExit';

// types
import type { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap } from '@Types/factoryTypes';

/**
 * A CLEARED SEAT LEAVES NO AWARD BEHIND: an exit in `structureId` awarded to one of `clearedDrawPositions` is taken
 * back unless `awardStands` keeps it (a carried exit, or one that came straight down its source's loser link). Asked by
 * `removeDirectedLoser` of the seat it empties (`aClearedLoserSeatLeavesNoAwardBehind`), and by
 * `removeOnwardLoserPlacements` of each seat it empties a link further on (`aSeatEmptiedFurtherOnLeavesNoAwardBehind`).
 * A module of its own because `removeDirectedParticipants` imports `removeOnwardLoserPlacements`: kept in the first,
 * the second could reach it only through an import cycle.
 */
export function withdrawAwardsToEmptiedSeats({
  clearedDrawPositions,
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  structureId,
  event,
}: {
  positionAssignments: PositionAssignment[];
  clearedDrawPositions: number[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structureId: string;
  event?: Event;
}) {
  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  for (const matchUp of resolvedMap?.mappedMatchUps?.[structureId]?.matchUps ?? []) {
    const { winningSide, matchUpStatus } = matchUp;
    if (!winningSide || !matchUpStatus || !isExit(matchUpStatus)) continue;
    const seat = getSideDrawPosition({
      matchUp: { ...matchUp, sides: undefined },
      sideNumber: winningSide,
      drawDefinition,
      structureId,
    });
    if (!seat || !clearedDrawPositions.includes(seat)) continue;
    const stands = awardStands({
      rederived: { matchUpStatus, winningSide },
      retained: getSideExitProvenance({ matchUp }),
      targetMatchUp: matchUp,
      positionAssignments,
      drawDefinition,
      structureId,
    });
    if (stands) continue;
    matchUp.winningSide = undefined;
    // ...and so does the BYE the award sent over its loser link for a loser who is nobody (P39): a pending exit sends
    // nothing there (census A1 wave 4, COMPASS 32/27 21081040: `anUndoneAwardTakesBackItsLoserSeatBye`)
    if (resolvedMap)
      withdrawByeSeats({
        claimantMatchUpId: matchUp.matchUpId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap: resolvedMap,
        event,
      });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'withdrawAwardsToEmptiedSeats',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }
}
