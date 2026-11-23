import { POLICY_TYPE_DRAWS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

type getDrawTypeCoercionArgs = {
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  drawType?: string;
};
export function getDrawTypeCoercion({ policyDefinitions, appliedPolicies, drawType }: getDrawTypeCoercionArgs) {
  const policyDefined = policyDefinitions?.[POLICY_TYPE_DRAWS]?.drawTypeCoercion;
  const policyApplied = appliedPolicies?.[POLICY_TYPE_DRAWS]?.drawTypeCoercion;

  return (
    (typeof policyDefined === 'boolean' ? policyDefined : undefined) ??
    (drawType && policyDefined?.[drawType]) ??
    (typeof policyApplied === 'boolean' ? policyApplied : undefined) ??
    (drawType && policyApplied?.[drawType]) ??
    true
  );
}
