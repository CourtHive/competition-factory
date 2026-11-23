import definitionTemplate from '@Generators/templates/drawDefinitionTemplate';
import { UUID } from '@Tools/UUID';

// types
import type { DrawDefinition, DrawTypeUnion, EventTypeUnion } from '@Types/tournamentTypes';

type NewDrawDefinitionArgs = {
  processCodes?: string[];
  matchUpType?: EventTypeUnion;
  drawType?: DrawTypeUnion;
  drawId?: string;
};
export function newDrawDefinition(params?: NewDrawDefinitionArgs): DrawDefinition {
  const { drawId = UUID(), processCodes, matchUpType, drawType } = params ?? {};
  // A spread, not Object.assign onto the template: the template's `drawId: undefined` intersected with the string
  // drawId reduced the inferred type to `never`, so every caller's drawDefinition was typed never.
  return { ...definitionTemplate(), processCodes, matchUpType, drawType, drawId };
}
