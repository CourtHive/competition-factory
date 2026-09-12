import { validateCollectionDefinition } from './validateCollectionDefinition';
import { decorateResult } from '@Functions/global/decorateResult';
import { isObject } from '@Tools/objects';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { Category, Event, GenderUnion } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ValidateTieFormatArgs = {
  checkCollectionIds?: boolean;
  enforceCategory?: boolean;
  enforceGender?: boolean;
  gender?: GenderUnion;
  category?: Category;
  tieFormat?: any; // not using TieFormat type because incoming value is potentially invalid
  event?: Event;
};

export function validateTieFormat(params: ValidateTieFormatArgs): ResultType {
  const checkCategory = !!(params?.enforceCategory !== false && params?.category);
  const checkGender = !!(params?.enforceGender !== false && params?.gender);
  // DEFAULT ENFORCES. An id-less tieFormat used to be reported valid, so a consumer validating
  // directly got a false all-clear while every generated line carried `collectionId: null` and the
  // tie never scored. Opt out with `checkCollectionIds: false` where validation legitimately runs
  // BEFORE ids are minted — `checkTieFormat` is the one such caller.
  const checkCollectionIds = params?.checkCollectionIds !== false;
  const tieFormat = params?.tieFormat;
  const event = params?.event;

  const stack = 'validateTieFormat';
  const errors: string[] = [];

  const paramsCheck = checkParams({ ...params, stack });
  if (paramsCheck?.error) return paramsCheck;

  let aggregateValueImperative;
  const validCollections = tieFormat.collectionDefinitions.every((collectionDefinition) => {
    const { setValue, scoreValue, collectionValue } = collectionDefinition;
    if ((setValue || scoreValue) && !collectionValue) aggregateValueImperative = true;
    const { valid, errors: collectionDefinitionErrors } = validateCollectionDefinition({
      referenceCategory: params.category,
      referenceGender: params.gender,
      collectionDefinition,
      checkCollectionIds,
      checkCategory,
      checkGender,
      event,
    });

    if (valid) {
      return true;
    } else if (Array.isArray(collectionDefinitionErrors)) {
      errors.push(...collectionDefinitionErrors);
    }
    return false;
  });

  const validWinCriteria =
    (typeof tieFormat.winCriteria?.valueGoal === 'number' &&
      tieFormat.winCriteria?.valueGoal > 0 &&
      !aggregateValueImperative) ||
    tieFormat.winCriteria?.aggregateValue;

  if (!(validWinCriteria || tieFormat.winCriteria?.aggregateValue)) {
    if (aggregateValueImperative) {
      errors.push('aggregateValue is required');
    } else {
      errors.push('Either non-zero valueGoal, or { aggregateValue: true } must be specified in winCriteria');
    }
    return decorateResult({
      context: { tieFormat, errors, aggregateValueImperative },
      result: { error: INVALID_TIE_FORMAT },
      stack,
    });
  }

  const collectionIds = tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const uniqueCollectionIds = !checkCollectionIds || collectionIds.length === unique(collectionIds).length;

  const valid = validCollections && validWinCriteria && uniqueCollectionIds;

  const result = { valid, errors };
  if (!valid) {
    return decorateResult({
      result: { error: INVALID_TIE_FORMAT },
      context: { tieFormat, errors },
      stack,
    });
  }
  return result;
}

function checkParams(params) {
  const { tieFormat, stack } = params;

  if (!params || !tieFormat || !isObject(tieFormat)) {
    return decorateResult({
      result: { error: INVALID_TIE_FORMAT },
      context: { tieFormat, message: 'tieformat must be an object' },
      stack,
    });
  }

  if (!isObject(tieFormat.winCriteria)) {
    return decorateResult({
      result: { error: INVALID_TIE_FORMAT },
      context: { tieFormat, message: 'tieformat.winCritiera must be an object' },
      stack,
    });
  }

  if (!Array.isArray(tieFormat.collectionDefinitions)) {
    return decorateResult({
      result: { error: INVALID_TIE_FORMAT },
      context: { tieFormat, message: 'collectionDefinitions must be an array' },
      stack,
    });
  }

  return { ...SUCCESS };
}
