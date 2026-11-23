import { decorateResult } from '@Functions/global/decorateResult';
import { coercedGender } from '@Helpers/coercedGender';
import { isGendered } from './isGendered';
import { isMixed } from './isMixed';
import { isAny } from './isAny';

// constants and types
import { INVALID_GENDER } from '@Constants/errorConditionConstants';
import { GenderUnion } from '@Types/tournamentTypes';
import { DOUBLES } from '@Constants/matchUpTypes';
import { ResultType } from '@Types/factoryTypes';

type GenderValidityCheckArgs = {
  referenceGender?: GenderUnion;
  matchUpType?: string;
  gender?: GenderUnion;
};

export const mixedGenderError = 'MIXED events can not contain mixed singles or { gender: ANY } collections';
export const anyMixedError = 'events with { gender: ANY } can not contain MIXED singles collections';

export function tieFormatGenderValidityCheck(params: GenderValidityCheckArgs): ResultType {
  const stack = 'tieFormatGenderValidityCheck';
  const { referenceGender, matchUpType, gender } = params;
  if (
    referenceGender &&
    gender &&
    isGendered(referenceGender) &&
    coercedGender(referenceGender) !== coercedGender(gender)
  )
    return decorateResult({
      result: { valid: false, error: INVALID_GENDER },
      context: { gender },
      stack,
    });

  if (isMixed(referenceGender) && (isAny(gender) || (isMixed(gender) && matchUpType !== DOUBLES))) {
    return decorateResult({
      result: { error: INVALID_GENDER, valid: false },
      info: mixedGenderError,
      stack,
    });
  }

  if (isAny(referenceGender) && isMixed(gender) && matchUpType !== DOUBLES)
    return decorateResult({
      result: { error: INVALID_GENDER, valid: false },
      info: anyMixedError,
      stack,
    });

  return { valid: true };
}
