import { checkTeamMembership, getTeamMemberships } from '@Mutate/matchUps/lineUps/teamMembership';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { removeLineUpSubstitutions } from './removeLineUpSubstitutions';
import { addDrawNotice } from '@Mutate/notifications/drawNotifications';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { validateLineUp } from '@Validators/validateTeamLineUp';

// constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, TieFormat, Tournament } from '@Types/tournamentTypes';
import { LineUp, ResultWarning } from '@Types/factoryTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// update an extension on the drawDefinition that keeps track of the latest lineUp for all team participantIds
// each matchUp in the draw will use this as the template on first load and then write lineUp to the matchUp

type UpdateTeamLineUpArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string;
  tieFormat: TieFormat;
  drawId?: string;
  lineUp: LineUp;
  event?: Event;
};

export function updateTeamLineUp({
  tournamentRecord,
  drawDefinition,
  participantId,
  tieFormat,
  lineUp,
  event,
}: UpdateTeamLineUpArgs): {
  warnings?: ResultWarning[];
  success?: boolean;
  error?: ErrorType;
} {
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (typeof participantId !== 'string') return { error: MISSING_PARTICIPANT_ID };

  const validation = validateLineUp({ lineUp, tieFormat });
  if (!validation.valid) return validation;

  // one player, one team, per event. Checked where the event is known: called through an engine; the lineUp
  // methods that call this internally have checked the player they place already
  const membership = event
    ? checkTeamMembership({
        memberships: getTeamMemberships({ tournamentRecord, event }),
        individualIds: (lineUp ?? []).map(({ participantId }) => participantId),
        teamParticipantId: participantId,
      })
    : {};
  if (membership.error) return membership;

  const existing = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS });

  const value = existing ?? {};
  value[participantId] = removeLineUpSubstitutions({ lineUp });

  setFirstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS, value });
  addDrawNotice({ drawDefinition });

  return { ...SUCCESS, warnings: membership.warnings };
}
