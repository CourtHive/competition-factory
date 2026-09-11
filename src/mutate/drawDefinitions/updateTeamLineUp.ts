import { setFirstClassOrExtension } from '../extensions/setFirstClassOrExtension';
import { removeLineUpSubstitutions } from './removeLineUpSubstitutions';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { addDrawNotice } from '../notifications/drawNotifications';
import { validateLineUp } from '@Validators/validateTeamLineUp';

// constants and types
import { ErrorType, MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { DrawDefinition, TieFormat } from '@Types/tournamentTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { LineUp } from '@Types/factoryTypes';

// update an extension on the drawDefinition that keeps track of the latest lineUp for all team participantIds
// each matchUp in the draw will use this as the template on first load and then write lineUp to the matchUp

type UpdateTeamLineUpArgs = {
  drawDefinition: DrawDefinition;
  participantId: string;
  tieFormat: TieFormat;
  drawId?: string;
  lineUp: LineUp;
};

export function updateTeamLineUp({ drawDefinition, participantId, tieFormat, lineUp }: UpdateTeamLineUpArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (typeof participantId !== 'string') return { error: MISSING_PARTICIPANT_ID };

  const validation = validateLineUp({ lineUp, tieFormat });
  if (!validation.valid) return validation;

  const existing = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS });

  const value = existing ?? {};
  value[participantId] = removeLineUpSubstitutions({ lineUp });

  setFirstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS, value });
  addDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}
