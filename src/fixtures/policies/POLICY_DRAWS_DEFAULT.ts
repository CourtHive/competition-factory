import { POLICY_TYPE_DRAWS } from '@Constants/policyConstants';

export const POLICY_DRAWS_DEFAULT = {
  [POLICY_TYPE_DRAWS]: {
    // the default without a policy, stated: a draws policy with no values is refused by `attachPolicies`
    drawTypeCoercion: true,
    // drawTypeCoercion: { ROUND_ROBIN_WITH_PLAYOFF: 5 }, // example of how to set a minimum # of participants for a specific drawType
    // drawTypeCoercion: false, // example of how to set a default for all drawTypes; without a policy defaults to true
  },
};

export default POLICY_DRAWS_DEFAULT;
