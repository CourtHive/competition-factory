import { DOUBLES_MATCHUP } from '@Constants/matchUpTypes';

export function getTieFormatDesc(tieFormat) {
  if (!tieFormat) return {};

  const matchUpFormats: string[] = [];

  const tieFormatName = tieFormat.tieFormatName;
  const tieFormatDesc = tieFormat.collectionDefinitions
    ?.map((def) => {
      const { matchUpType, matchUpFormat, matchUpCount, category, gender, matchUpTypeOptions } = def;

      if (!matchUpFormats.includes(matchUpFormat)) matchUpFormats.push(matchUpFormat);

      const ageCategoryCode = category?.ageCategoryCode;
      const unresolvedChoice = matchUpTypeOptions !== undefined && matchUpType === undefined;
      let matchUpTypeCode = matchUpType === DOUBLES_MATCHUP ? 'D' : 'S';
      if (unresolvedChoice) matchUpTypeCode = '?';
      const fields = [matchUpCount, matchUpTypeCode, ageCategoryCode, matchUpFormat, gender];
      // Preserve legacy descriptors exactly; choice declarations also participate in format identity.
      if (matchUpTypeOptions !== undefined) fields.push(`options:${JSON.stringify(matchUpTypeOptions)}`);
      return fields.join(';');
    })
    .join('|');
  return {
    tieFormatName: (tieFormat && tieFormatName) || 'UNNAMED',
    matchUpFormats,
    tieFormatDesc,
  };
}
