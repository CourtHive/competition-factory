import { attachPolicies } from '@Assemblies/governors/policyGovernor';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and fixtures
import { EXISTING_POLICY_TYPE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { ResultType } from '@Types/factoryTypes';

export function policyAttachment({ appliedPolicies, policyDefinitions, drawDefinition, stack }) {
  // ---------------------------------------------------------------------------
  // Attach policies to the drawDefinition
  // if there is an avoidance policy on the event, it must be preserved in the drawDefinition
  // if there is an avoidance policy in policyDefinitions, it will override
  // avoidance policies on the event can be changed (if location used for UI)

  if (policyDefinitions && typeof policyDefinitions !== 'object')
    return decorateResult({
      info: 'policyDefinitions must be an object',
      result: { error: INVALID_VALUES },
      stack,
    });

  const policiesToAttach = {
    [POLICY_TYPE_AVOIDANCE]: appliedPolicies?.[POLICY_TYPE_AVOIDANCE],
  };

  if (policyDefinitions) {
    const result = existingPolicyDefinitions({ policyDefinitions, appliedPolicies, policiesToAttach, drawDefinition });
    if (result?.error) return decorateResult({ result, stack });
  } else if (policiesToAttach.avoidance) {
    const result = attached(attachPolicies({ drawDefinition, policyDefinitions: policiesToAttach }));
    if (result?.error) return decorateResult({ result, stack });
  }

  if (!appliedPolicies?.[POLICY_TYPE_SEEDING] && !policyDefinitions?.[POLICY_TYPE_SEEDING]) {
    const result = attached(attachPolicies({ policyDefinitions: POLICY_SEEDING_DEFAULT, drawDefinition }));
    if (result?.error) return decorateResult({ result, stack });
    if (appliedPolicies) Object.assign(appliedPolicies, POLICY_SEEDING_DEFAULT);
  }

  return { error: undefined };
}

/**
 * A refused attach was discarded here, and the draw was generated without the policy. EXISTING_POLICY_TYPE is not a
 * refusal: an existing drawDefinition that already holds the policy type keeps it, as before.
 */
function attached(result: ResultType): ResultType | undefined {
  return result.error && result.error !== EXISTING_POLICY_TYPE ? result : undefined;
}

function existingPolicyDefinitions({ policyDefinitions, appliedPolicies, policiesToAttach, drawDefinition }) {
  for (const key of Object.keys(policyDefinitions)) {
    if (JSON.stringify(appliedPolicies?.[key]) !== JSON.stringify(policyDefinitions[key])) {
      policiesToAttach[key] = policyDefinitions[key];
    }
  }

  if (Object.keys(policiesToAttach).length) {
    // attach any policyDefinitions which have been provided and are not already present
    const result = attached(attachPolicies({ policyDefinitions: policiesToAttach, drawDefinition }));
    if (result) return result;
    if (appliedPolicies) Object.assign(appliedPolicies, policiesToAttach);
  }
  return undefined;
}
