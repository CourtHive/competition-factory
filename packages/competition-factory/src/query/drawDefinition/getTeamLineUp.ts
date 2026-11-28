import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';

// constants
import { MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { LINEUPS } from '@Constants/extensionConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';

type GetTeamLineUpArgs = {
  drawDefinition?: DrawDefinition;
  participantId?: string;
};
export function getTeamLineUp({ drawDefinition, participantId }: GetTeamLineUpArgs) {
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (typeof participantId !== 'string') return { error: MISSING_PARTICIPANT_ID };

  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const lineUp = lineUps[participantId];

  return { lineUp };
}
