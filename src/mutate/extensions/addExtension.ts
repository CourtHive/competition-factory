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
    params.extension.createdAt ??= new Date().toISOString();
  }

  // ── Invariant: AT MOST ONE extension per `name`, per element ──
  //
  // Find-and-replace, push only when absent. This is what MAINTAINS the invariant, and readers
  // depend on it: `getAppliedPolicies` and friends resolve an extension with `.find()`, which
  // returns the FIRST match. Writer and reader therefore agree by construction.
  //
  // Nothing ENFORCES the invariant, though — it is upheld here rather than validated on the way in.
  // A record assembled outside this API (hand-built fixture, importer, classic-converter, legacy
  // storage) can carry two extensions of the same name, and every `.find()` reader will silently
  // use the first and ignore the second. That is quiet data loss on a path nothing checks, which is
  // why `analyzeTournament` reports duplicates as `extensionAnomalies` rather than anyone throwing.
  //
  // If you are here because a policy you attached "did not take effect", the cause is more likely a
  // duplicate already on the element than anything wrong with this function.
  const existingExtension = params.element.extensions.find(({ name }) => name === params.extension.name);
  if (existingExtension) {
    existingExtension.value = params.extension.value;
  } else if (params.extension.value) {
    params.element.extensions.push(params.extension);
  }

  return { ...SUCCESS };
}
