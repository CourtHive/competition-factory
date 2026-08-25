import { makeDeepCopy } from '@Tools/makeDeepCopy';

import { APPLIED_POLICIES } from '@Constants/extensionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ErrorType, MISSING_POLICY_TYPE, POLICY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';

type GetAppliedPoliciesArgs = {
  onlySpecifiedPolicyTypes?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  policyTypes?: string[];
  structure?: Structure;
  event?: Event;
};

export function getAppliedPolicies({
  onlySpecifiedPolicyTypes = false,
  policyTypes = [],
  tournamentRecord,
  drawDefinition,
  structure,
  event,
}: GetAppliedPoliciesArgs): {
  appliedPolicies?: PolicyDefinitions;
  error?: ErrorType;
} {
  if (!Array.isArray(policyTypes)) return { error: MISSING_POLICY_TYPE };
  const appliedPolicies = {};

  if (tournamentRecord) extractAppliedPolicies(tournamentRecord);
  if (event) extractAppliedPolicies(event);
  if (drawDefinition) extractAppliedPolicies(drawDefinition);
  if (structure) extractAppliedPolicies(structure);

  return { appliedPolicies, ...SUCCESS };

  function extractAppliedPolicies(params) {
    const extensions = params?.extensions;
    // `.find()` takes the FIRST extension of this name, which is correct because `addExtension`
    // maintains at most one per name per element — it replaces in place and pushes only when
    // absent, and `attachPolicies` goes through it (guarding again per policyType with
    // EXISTING_POLICY_TYPE unless `allowReplacement`). Writer and reader agree by construction.
    //
    // This is NOT a fail-open, and it has been mistaken for one: a dropped duplicate is not
    // systematically more permissive — the surviving FIRST extension may be stricter or looser than
    // the one ignored. The real exposure is narrower: the invariant is convention rather than
    // enforcement, so a record built outside the API can carry duplicates whose later entries
    // vanish without error. `analyzeTournament` reports those as `extensionAnomalies`.
    const extensionPolicies = extensions?.find((extension) => extension.name === APPLIED_POLICIES)?.value;
    if (extensionPolicies) {
      for (const key of Object.keys(extensionPolicies))
        if (onlySpecifiedPolicyTypes ? policyTypes.includes(key) : !policyTypes.length || policyTypes.includes(key)) {
          appliedPolicies[key] = makeDeepCopy(extensionPolicies[key], false, true);
        }
    }
  }
}

type GetPolicyDefinitionsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  policyTypes?: string[];
  structure?: Structure;
  event?: Event;
};
export function getPolicyDefinitions({
  policyTypes = [],
  tournamentRecord,
  drawDefinition,
  structure,
  event,
}: GetPolicyDefinitionsArgs): {
  policyDefinitions?: PolicyDefinitions;
  error?: ErrorType;
  info?: string;
} {
  if (!Array.isArray(policyTypes)) return { error: MISSING_POLICY_TYPE };

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });

  const policyDefinitions: PolicyDefinitions = {};

  for (const policyType of policyTypes) {
    const policy = appliedPolicies?.[policyType];
    if (policy) policyDefinitions[policyType] = policy;
  }

  return Object.keys(policyDefinitions).length ? { policyDefinitions } : { info: POLICY_NOT_FOUND.message };
}
