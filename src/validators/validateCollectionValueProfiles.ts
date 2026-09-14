import { unique } from '@Tools/arrays';

// constants and types
import { CollectionValueProfile } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ValidateCollectionDefinitionArgs = {
  collectionValueProfiles: CollectionValueProfile[];
  matchUpCount: number;
};

export function validateCollectionValueProfiles({
  collectionValueProfiles,
  matchUpCount,
}: ValidateCollectionDefinitionArgs) {
  const errors: string[] = [];
  if (!Array.isArray(collectionValueProfiles)) {
    errors.push(`collectionValueProfiles is not an array: ${collectionValueProfiles}`);
    return { errors };
  }
  if (collectionValueProfiles.length && collectionValueProfiles.length !== matchUpCount) {
    errors.push(`collectionValueProfiles do not align with matchUpsCount`);
    return { errors };
  }
  for (const valueProfile of collectionValueProfiles) {
    if (typeof valueProfile !== 'object') {
      errors.push(`valueProfile is not type object: ${valueProfile}`);
      return { errors };
    }
    const { matchUpValue, collectionPosition } = valueProfile;
    if (
      typeof matchUpValue !== 'number' ||
      typeof collectionPosition !== 'number' ||
      collectionPosition > matchUpCount ||
      collectionPosition < 1
    ) {
      errors.push(
        `Invalid value profile: value and collectionPosition must be numeric. collectionPosition cannot be greater than matchUpCount`,
      );
      return { errors };
    }
  }
  const collectionPositions = collectionValueProfiles.map((valueProfile) => valueProfile.collectionPosition);
  if (collectionPositions.length !== unique(collectionPositions).length) {
    errors.push('collectionPositions are not unique');
    return { errors };
  }

  return { ...SUCCESS };
}
