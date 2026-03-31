import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import tieFormatDefaults from '../templates/tieFormatDefaults';
import { coercedGender } from '@Helpers/coercedGender';
import { isGendered } from '@Validators/isGendered';
import { isMixed } from '@Validators/isMixed';
import { isObject } from '@Tools/objects';
import { UUID } from '@Tools/UUID';

// constants
import { FEMALE, MIXED, OTHER, MALE, ANY } from '@Constants/genderConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

export function processTieFormat(params) {
  const { alternatesCount = 0, tieFormatName, drawSize } = params;

  let maxDoublesCount = 0,
    maxSinglesCount = 0;

  let singlesMatchUpTotal = 0,
    doublesMatchUpTotal = 0;

  const categories = {};
  const genders = { [MALE]: 0, [FEMALE]: 0, [MIXED]: 0, [OTHER]: 0, [ANY]: 0 };

  const tieFormat = isObject(params.tieFormat) ? params.tieFormat : tieFormatDefaults({ namedFormat: tieFormatName });

  tieFormat?.collectionDefinitions?.filter(Boolean).forEach((collectionDefinition) => {
    const { category, collectionId, matchUpType, matchUpCount, gender } = collectionDefinition;

    if (isGendered(gender)) {
      const coerced = coercedGender(gender);
      const required = matchUpCount * (matchUpType === DOUBLES ? 2 : 1);
      if (coerced && genders[coerced] < required) genders[coerced] = required;
    } else if (isMixed(gender)) {
      if (genders[MALE] < matchUpCount) genders[MALE] = matchUpCount;
      if (genders[FEMALE] < matchUpCount) genders[FEMALE] = matchUpCount;
    }

    if (category) {
      const categoryString = JSON.stringify(category);
      categories[categoryString] = category;
    }

    // ensure every collectionDefinition has a collectionId
    if (!collectionId) collectionDefinition.collectionId = UUID(undefined, params.random);

    if (isMatchUpEventType(DOUBLES)(matchUpType)) {
      const doublesCount = matchUpCount;
      doublesMatchUpTotal += matchUpCount;
      maxDoublesCount = Math.max(maxDoublesCount, doublesCount);
    }

    if (isMatchUpEventType(SINGLES)(matchUpType)) {
      const singlescount = matchUpCount;
      singlesMatchUpTotal += matchUpCount;
      maxSinglesCount = Math.max(maxSinglesCount, singlescount);
    }
  });

  const teamSize = Object.keys(categories).length
    ? Math.max(singlesMatchUpTotal, doublesMatchUpTotal * 2)
    : Math.max(maxSinglesCount, maxDoublesCount * 2);
  const maxDoublesDraw = maxDoublesCount * (drawSize + alternatesCount);
  const maxSinglesDraw = maxSinglesCount * (drawSize + alternatesCount);

  return {
    maxDoublesDraw,
    maxSinglesDraw,
    teamSize,
    genders,
  };
}
