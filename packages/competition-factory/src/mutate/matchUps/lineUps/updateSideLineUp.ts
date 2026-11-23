import { commitAssignedLineUp } from './commitAssignedLineUp';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type UpdateSideLineUpArgs = {
  inContextTargetMatchUp?: HydratedMatchUp;
  drawPositionSideIndex?: number;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  teamParticipantId?: string;
  matchUp: MatchUp;
  event?: Event;
};

export function updateSideLineUp({
  inContextTargetMatchUp,
  drawPositionSideIndex,
  teamParticipantId,
  tournamentRecord,
  drawDefinition,
  matchUp,
  event,
}: UpdateSideLineUpArgs) {
  // update matchUp.sides to include lineUps
  const drawPositionSideNumber =
    drawPositionSideIndex === undefined
      ? undefined
      : inContextTargetMatchUp?.sides?.[drawPositionSideIndex]?.sideNumber;

  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const lineUp = makeDeepCopy(lineUps[String(teamParticipantId)], false, true);

  commitAssignedLineUp(matchUp, drawPositionSideNumber, lineUp);

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'updateSidLineUp',
    eventId: event?.eventId,
    event,
    drawDefinition,
    matchUp,
  });
}
