import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants
import { MISSING_DRAW_DEFINITION, MISSING_PARTICIPANT_ID } from '@Constants/errorConditionConstants';
import { LINEUPS } from '@Constants/extensionConstants';

export function getTeamLineUp({ drawDefinition, participantId }) {
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (typeof participantId !== 'string') return { error: MISSING_PARTICIPANT_ID };

  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const lineUp = lineUps[participantId];

  return { lineUp };
}
