import { REMOVE_SEED, SEED_VALUE } from '@Constants/positionActionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';

export const POLICY_POSITION_ACTIONS_UNRESTRICTED = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'positionActionsUnrestricted',

    // positionActions will be selectively enabled for structures matching { stages: [], stageSequences: [], structureTypes: [] }
    // enabledStructures: [] => all structures are enabled
    enabledStructures: [],

    // enables entries in other flights to be accessed as alternates
    otherFlightEntries: true,

    // enables entries with multiple qualifying roundTargets to be placed in any round
    disableRoundRestrictions: true,

    // enable specific actions even when there are active positions
    activePositionOverrides: [SEED_VALUE, REMOVE_SEED],
  },
};

export default POLICY_POSITION_ACTIONS_UNRESTRICTED;
