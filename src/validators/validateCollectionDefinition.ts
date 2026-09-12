import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { validateCollectionValueProfiles } from '@Validators/validateCollectionValueProfiles';
import { tieFormatGenderValidityCheck } from '@Validators/tieFormatGenderValidityCheck';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { categoryCanContain } from '@Query/event/categoryCanContain';
import { decorateResult } from '@Functions/global/decorateResult';
import { isConvertableInteger } from '@Tools/math';

// constants and types
import { INVALID_CATEGORY, INVALID_COLLECTION_DEFINITION, INVALID_OBJECT } from '@Constants/errorConditionConstants';
import { Category, CollectionDefinition, Event, EventTypeUnion, GenderUnion } from '@Types/tournamentTypes';
import { DOUBLES, HYBRID, SINGLES } from '@Constants/matchUpTypes';

type ValidateCollectionDefinitionArgs = {
  collectionDefinition: CollectionDefinition;
  referenceGender?: GenderUnion;
  referenceCategory?: Category;
  checkCollectionIds?: boolean;
  eventType?: EventTypeUnion;
  checkCategory?: boolean;
  checkGender?: boolean;
  event?: Event;
};
export function validateCollectionDefinition({
  checkCategory = true,
  collectionDefinition,
  checkCollectionIds,
  checkGender = true,
  referenceCategory,
  referenceGender,
  event,
}: ValidateCollectionDefinitionArgs) {
  referenceGender = referenceGender ?? event?.gender;
  const stack = 'validateCollectionDefinition';
  const errors: string[] = [];

  if (typeof collectionDefinition !== 'object') {
    errors.push(`collectionDefinition must be an object: ${collectionDefinition}`);
    return decorateResult({ result: { errors, error: INVALID_OBJECT }, stack });
  }

  const {
    collectionValueProfiles,
    collectionGroupNumber,
    collectionValue,
    collectionId,
    matchUpCount,
    matchUpFormat,
    matchUpValue,
    matchUpType,
    scoreValue,
    setValue,
    category,
    gender,
  } = collectionDefinition;

  if (checkCollectionIds && typeof collectionId !== 'string') {
    // A published `fixtures.tieFormats.*` object carries no collectionIds — it cannot, since a
    // collectionId identifies a collection INSTANCE within a record. Say so, rather than leaving the
    // caller to infer it from a type complaint.
    errors.push(
      `collectionId is not type string: ${collectionId}. ` +
        'Mint collectionIds before validating — a published tieFormat fixture carries none.',
    );
  }
  if (typeof matchUpCount !== 'number') {
    errors.push(`matchUpCount is not type number: ${matchUpCount}`);
  }
  if (matchUpType && !includesMatchUpEventType([SINGLES, DOUBLES, HYBRID], matchUpType)) {
    errors.push(`matchUpType must be SINGLES, DOUBLES, or HYBRID: ${matchUpType}`);
  }

  const valueDeclarations = [!!collectionValueProfiles?.length]
    .concat([matchUpValue, collectionValue, scoreValue, setValue].map(isConvertableInteger))
    .filter(Boolean);

  if (valueDeclarations.length !== 1) {
    errors.push('Missing value definition for matchUps: matchUpValue, collectionValue, or collectionValueProfiles');
  }

  if (matchUpValue && typeof matchUpValue !== 'number') {
    errors.push(`matchUpValue is not type number: ${matchUpValue}`);
  }
  if (collectionValue && typeof collectionValue !== 'number') {
    errors.push(`collectionValue is not type number: ${collectionValue}`);
  }
  if (collectionValueProfiles && matchUpCount) {
    const result = validateCollectionValueProfiles({
      collectionValueProfiles,
      matchUpCount,
    });
    if (result.errors) {
      errors.push(...result.errors);
    }
  }

  if (collectionGroupNumber && typeof collectionGroupNumber !== 'number') {
    errors.push(`collectionGroupNumber is not type number: ${collectionValue}`);
  }

  if (matchUpFormat && !isValidMatchUpFormat({ matchUpFormat })) {
    errors.push(`Invalid matchUpFormat: ${matchUpFormat}`);
  }

  if (checkGender) {
    const result = tieFormatGenderValidityCheck({
      referenceGender,
      matchUpType,
      gender,
    });

    if (result.error) {
      return decorateResult({
        context: { referenceGender, gender },
        result,
        stack,
      });
    }
  }

  if (checkCategory && referenceCategory && category) {
    const result = categoryCanContain({
      category: referenceCategory,
      childCategory: category,
    });
    if (!result.valid)
      return decorateResult({
        result: { error: INVALID_CATEGORY },
        context: result,
        stack,
      });
  }

  if (errors.length)
    return decorateResult({
      result: { errors, error: INVALID_COLLECTION_DEFINITION },
      stack,
    });

  return { valid: true };
}
