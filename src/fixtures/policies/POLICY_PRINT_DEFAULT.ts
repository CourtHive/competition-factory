import { POLICY_TYPE_PRINT } from '@Constants/policyConstants';

// Tournament-level print composition policy. The full shape is defined in
// pdf-factory's CompositionConfig type (per print type) and resolved at
// print time. The default is empty — no overrides applied — so the
// provider-scoped policy from the server takes effect unchanged.
//
// See Mentat/planning/PRINT_COMPOSITION_POLICY_PLAN.md for the architecture.
export const POLICY_PRINT_DEFAULT = {
  [POLICY_TYPE_PRINT]: {
    policyName: 'Default Print Configuration',
  },
};

export default POLICY_PRINT_DEFAULT;
