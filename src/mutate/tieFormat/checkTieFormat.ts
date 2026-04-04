import { validateTieFormat } from '@Validators/validateTieFormat';
import { UUID } from '@Tools/UUID';

// types
import { TieFormat } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type CheckTieFormatArgs = {
  tieFormat: TieFormat;
};
// add collectionIds if missing
export function checkTieFormat({ tieFormat }: CheckTieFormatArgs): ResultType & { tieFormat?: TieFormat } {
  const result = validateTieFormat({
    checkCollectionIds: false,
    tieFormat,
  });
  if (result.error) return result;

  for (const collectionDefinition of tieFormat.collectionDefinitions) {
    collectionDefinition.collectionId ??= UUID();
  }

  return { tieFormat };
}
