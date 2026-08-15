import { isValidExtension } from '@Validators/isValidExtension';
import { decorateResult } from '@Functions/global/decorateResult';

import { SUCCESS } from '@Constants/resultConstants';
import { ErrorType, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

import { TournamentRecords } from '@Types/factoryTypes';
import { Extension } from '@Types/tournamentTypes';

type AddExtensionArgs = {
  tournamentRecords?: TournamentRecords;
  activeTournamentId?: string;
  creationTime?: boolean;
  tournamentId?: string;
  extension: Extension;
  discover?: boolean;
  element?: any;
};

export function addExtension(params?: AddExtensionArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  if (typeof params !== 'object') return { error: MISSING_VALUE };
  const stack = 'addExtension';

  if (params?.element && typeof params.element !== 'object')
    return decorateResult({ result: { error: INVALID_VALUES }, stack });

  if (!isValidExtension({ extension: params.extension }))
    return decorateResult({
      result: { error: INVALID_VALUES, info: 'invalid extension' },
      stack,
    });

  if (!params.element) {
    if (params.discover && !params.tournamentId && params.tournamentRecords) {
      for (const tournamentRecord of Object.values(params.tournamentRecords)) {
        const result = addExtension({
          extension: params.extension,
          element: tournamentRecord,
        });
        if (result.error) return decorateResult({ result, stack });
      }
      return { ...SUCCESS };
    } else {
      return decorateResult({ result: { error: MISSING_VALUE }, stack });
    }
  }

  if (!params.element.extensions) params.element.extensions = [];

  const creationTime = params?.creationTime ?? true;

  if (creationTime) {
    // Honour a `createdAt` already on the caller's extension rather than
    // stamping over it — same convention as `addTimeItem`. Inert when nothing is
    // supplied; `creationTime: false` still means "add no createdAt at all".
    //
    // The cast is deliberate and temporary. `Extension` does not DECLARE
    // `createdAt`, even though this function has always written one — the
    // previous `Object.assign(extension, { createdAt })` simply bypassed the
    // checker, so the type has been out of sync with runtime for as long as the
    // field has existed. The correct fix is `createdAt?: Date | string` on
    // `Extension` (mirroring `TimeItem`), but `src/types/tournamentTypes.ts` is
    // held by an active in-flight claim
    // (`codes-participant-other-ids-and-event-origin-stamp`), so the type
    // addition is deferred rather than colliding with it.
    (params.extension as any).createdAt ??= new Date().toISOString();
  }

  const existingExtension = params.element.extensions.find(({ name }) => name === params.extension.name);
  if (existingExtension) {
    existingExtension.value = params.extension.value;
  } else if (params.extension.value) {
    params.element.extensions.push(params.extension);
  }

  return { ...SUCCESS };
}
