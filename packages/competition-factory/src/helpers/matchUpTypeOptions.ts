import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

/** Validate the choice declaration without assigning an implicit selection. */
export function matchUpTypeOptionsErrors(
  { matchUpTypeOptions, matchUpType }: { matchUpTypeOptions?: unknown; matchUpType?: unknown },
  { newUse = false, allowResolved = false }: { newUse?: boolean; allowResolved?: boolean } = {},
): string[] {
  if (matchUpTypeOptions === undefined) return [];
  if (!Array.isArray(matchUpTypeOptions)) return ['matchUpTypeOptions must be an array'];
  const errors: string[] = [];
  if (matchUpTypeOptions.length < 2 || new Set(matchUpTypeOptions).size !== matchUpTypeOptions.length)
    errors.push('matchUpTypeOptions must contain at least two distinct types');
  for (const option of matchUpTypeOptions) {
    if (option !== SINGLES && option !== DOUBLES) {
      errors.push('matchUpTypeOptions supports only SINGLES and DOUBLES');
      break;
    }
  }
  if (matchUpType !== undefined && !matchUpTypeOptions.includes(matchUpType))
    errors.push('selected matchUpType must belong to matchUpTypeOptions');
  if (newUse && matchUpType !== undefined && !allowResolved)
    errors.push('Resolve matchUpTypeOptions only for a TEAM encounter');
  return errors;
}

export function unresolvedCollectionChoice(collection?: {
  matchUpTypeOptions?: unknown;
  matchUpType?: unknown;
}): boolean {
  return collection?.matchUpTypeOptions !== undefined && !collection.matchUpType;
}

export function choiceMatchUpType<T>(
  collection: Parameters<typeof unresolvedCollectionChoice>[0],
  fallback: T,
): T | undefined {
  return unresolvedCollectionChoice(collection) ? undefined : fallback;
}
