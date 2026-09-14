import { attachPolicies } from '@Assemblies/governors/policyGovernor';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and fixtures
import { POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

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
    existingPolicyDefinitions({ policyDefinitions, appliedPolicies, policiesToAttach, drawDefinition });
  } else if (policiesToAttach.avoidance) {
    attachPolicies({ drawDefinition, policyDefinitions: policiesToAttach });
  }

  if (!appliedPolicies?.[POLICY_TYPE_SEEDING] && !policyDefinitions?.[POLICY_TYPE_SEEDING]) {
    attachPolicies({
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      drawDefinition,
    });
    if (appliedPolicies) Object.assign(appliedPolicies, POLICY_SEEDING_DEFAULT);
  }

  return { error: undefined };
}

function existingPolicyDefinitions({ policyDefinitions, appliedPolicies, policiesToAttach, drawDefinition }) {
  for (const key of Object.keys(policyDefinitions)) {
    if (JSON.stringify(appliedPolicies?.[key]) !== JSON.stringify(policyDefinitions[key])) {
      policiesToAttach[key] = policyDefinitions[key];
    }
  }

  if (Object.keys(policiesToAttach).length) {
    // attach any policyDefinitions which have been provided and are not already present
    attachPolicies({
      policyDefinitions: policiesToAttach,
      drawDefinition,
    });
    if (appliedPolicies) Object.assign(appliedPolicies, policiesToAttach);
  }
}
