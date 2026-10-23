import { generateAndPopulatePlayoffStructures } from '@Assemblies/generators/drawDefinitions/generateAndPopulatePlayoffStructures';
import { decorateResult } from '@Functions/global/decorateResult';
import { attachPlayoffStructures } from './attachStructures';

export function addPlayoffStructures(params) {
  const result = generateAndPopulatePlayoffStructures(params);
  // the refusal is returned whole: its info and context name what was refused
  if (result.error) return decorateResult({ result, stack: 'addPlayoffStructures' });
  const { structures, links, matchUpModifications } = result;

  const drawDefinition = params.drawDefinition;

  return attachPlayoffStructures({
    tournamentId: params.tournamentRecord?.tournamentId,
    eventId: params.event?.eventId || params.eventId,
    matchUpModifications,
    drawDefinition,
    structures,
    links,
  });
}
