import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

/**
 * Attaches a profile's `policyDefinitions` one policy type at a time, so that a refusal names the policy type.
 * A refusal was discarded here and generation succeeded without the policy; a bare policy body passed in place of
 * `{ [policyType]: body }` (e.g. POLICY_SANCTIONING_USTA) attached its fields as junk policy types. A policy type
 * whose value is undefined or null is absent.
 */
export function attachProfilePolicies({
  policyDefinitions,
  tournamentRecord,
  option,
  event,
}: {
  tournamentRecord?: Tournament;
  policyDefinitions?: any;
  option: string;
  event?: Event;
}): ResultType | undefined {
  if (policyDefinitions === undefined || policyDefinitions === null) return undefined;
  if (!isObject(policyDefinitions)) {
    return { error: INVALID_VALUES, info: `${option} must be an object`, context: { option } };
  }

  for (const [policyType, policy] of Object.entries(policyDefinitions)) {
    if (policy === undefined || policy === null) continue;
    const result = attachPolicies({ policyDefinitions: { [policyType]: policy }, tournamentRecord, event });
    if (result.error) {
      const refused = `${option}.${policyType}`;
      return { error: result.error, info: `policy refused: ${refused}`, context: { option: refused } };
    }
  }

  return undefined;
}
