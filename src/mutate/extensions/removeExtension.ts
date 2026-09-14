import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_VALUE, NOT_FOUND } from '@Constants/errorConditionConstants';
import { ELEMENT_REQUIRED, MISSING_NAME } from '@Constants/infoConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type RemoveExtensionResult = {
  success?: boolean;
  error?: ErrorType;
  info?: any;
};
export function removeExtension(params?: {
  tournamentRecords?: TournamentRecords;
  element?: { extensions?: any[] };
  discover?: boolean;
  name?: string;
}): RemoveExtensionResult {
  if (!params || typeof params !== 'object') return { error: MISSING_VALUE };
  if (params.element && typeof params?.element !== 'object') return { error: INVALID_VALUES };
  if (!params?.name) return { error: MISSING_VALUE, info: MISSING_NAME };
  if (!params?.element) {
    if (params.discover && params.tournamentRecords) {
      for (const tournamentId of Object.keys(params.tournamentRecords)) {
        const tournamentRecord = params.tournamentRecords[tournamentId];
        const result = removeExtension({
          element: tournamentRecord,
          name: params.name,
        });
        if (result.error) return decorateResult({ result, stack: 'removeExtension' });
      }
      return { ...SUCCESS };
    }
    return { error: MISSING_VALUE, info: ELEMENT_REQUIRED };
  }
  if (!params?.element.extensions) return { ...SUCCESS, info: NOT_FOUND };

  params.element.extensions = params.element.extensions.filter((extension) => extension?.name !== params.name);

  return { ...SUCCESS };
}
