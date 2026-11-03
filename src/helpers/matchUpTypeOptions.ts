import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

/** Validate the choice declaration without assigning an implicit selection. */
export function matchUpTypeOptionsErrors(
  { matchUpTypeOptions, matchUpType }: { matchUpTypeOptions?: unknown; matchUpType?: unknown },
  newUse = false,
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
  if (newUse) errors.push("Captain's Choice matchUpTypeOptions is not yet enabled for new use");
  return errors;
}
