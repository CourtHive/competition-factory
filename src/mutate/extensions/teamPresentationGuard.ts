import { normalizeTeamPresentation } from '@Validators/teamColors';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DISPLAY } from '@Constants/extensionConstants';
import { Extension } from '@Types/tournamentTypes';

/**
 * Team presentation is read tolerantly (bad entries dropped) at hydration, so the public extension writers reject
 * it whole. Kept out of `addExtension` itself, which the bare syncEngine bundles for internal callers.
 */
export function refuseInvalidTeamPresentation(extension?: Extension): { error?: ErrorType } | undefined {
  const presentation = extension?.name === DISPLAY ? extension.value?.teamPresentation : undefined;
  if (presentation === undefined) return undefined;
  const issues: string[] = [];
  normalizeTeamPresentation(presentation, issues);
  if (!issues.length) return undefined;
  return decorateResult({
    result: { error: INVALID_VALUES, info: issues.join('; ') },
    stack: 'refuseInvalidTeamPresentation',
  });
}
