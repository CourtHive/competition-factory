import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';

// constants and types
import { DrawDefinition, Event, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MatchUpsMap } from '@Types/factoryTypes';

type ModifyRoundRobinMatchUpStatusArgs = {
  positionAssignments: PositionAssignment[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structure: Structure;
  event?: Event;
};
export function modifyRoundRobinMatchUpsStatus({
  positionAssignments,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  structure,
  event,
}: ModifyRoundRobinMatchUpStatusArgs) {
  const { matchUps } = getAllStructureMatchUps({
    drawDefinition,
    matchUpsMap,
    structure,
    event,
  });

  matchUps.forEach((matchUp) => {
    const matchUpAssignments = positionAssignments.filter(({ drawPosition }) =>
      matchUp.drawPositions?.includes(drawPosition),
    );
    const matchUpContainsBye = matchUpAssignments.filter((assignment) => assignment.bye).length;

    if (!matchUp.winningSide) {
      const matchUpStatus = matchUpContainsBye ? BYE : TO_BE_PLAYED;

      Object.assign(matchUp, { matchUpStatus });
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        context: 'modifyRoundRobinMatchUpsStatus',
        eventId: event?.eventId,
        drawDefinition,
        matchUp,
        event,
      });
    }
  });
}
