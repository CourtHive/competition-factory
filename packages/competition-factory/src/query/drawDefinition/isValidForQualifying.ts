import { getStructureLinks } from './linkGetter';
import { intersection } from '@Tools/arrays';
import { isString } from '@Tools/objects';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { BOTTOM_UP, RANDOM, TOP_DOWN, WATERFALL } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function isValidForQualifying({ structureId, drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!isString(structureId)) return { error: INVALID_VALUES };

  const result = getStructureLinks({
    drawDefinition,
    structureId,
  });
  if (result.error) return result;

  const targetFeedProfiles = result.links.target.flatMap((t) => t.target.feedProfile).filter(Boolean);

  const valid = !intersection([BOTTOM_UP, TOP_DOWN, RANDOM, WATERFALL], targetFeedProfiles).length;

  return { ...SUCCESS, valid };
}
