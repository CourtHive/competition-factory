import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import {
  ADD_NICKNAME,
  ADD_PENALTY,
  ASSIGN_QUALIFIER,
  QUALIFYING_PARTICIPANT,
  SEED_VALUE,
} from '@Constants/positionActionConstants';

export const POLICY_POSITION_ACTIONS_DEFAULT = {
  [POLICY_TYPE_POSITION_ACTIONS]: {
    policyName: 'positionActionsDefault',

    // positionActions will be selectively enabled for structures matching { stages: [], stageSequences: [] }
    // enabledStructures: [] => all structures are enabled
    enabledStructures: [
      {
        stages: [QUALIFYING, MAIN], // stages to which this policy applies
        stageSequences: [1], // stageSequences to which this policy applies
        enabledActions: [], // enabledActions: [] => all actions are enabled
        disabledActions: [], // disabledActions: [] => no actions are disabled
      },
      {
        stages: [], // stages: [] => applies to all stages
        stageSequences: [], // stageSequences: [] => applies to all stageSequences
        enabledActions: [ADD_NICKNAME, ADD_PENALTY, QUALIFYING_PARTICIPANT, ASSIGN_QUALIFIER, SEED_VALUE],
        disabledActions: [], // disabledActions: [] => no actions are disabled
      },
    ],

    // positionActions will be completely disabled for any structures matching { stages: [], stageSequences: [] }
    // disabledStructures: [] => no structures are disabled
    disabledStructures: [],

    // enables entries in other flights to be accessed as alternates
    otherFlightEntries: false,

    // enable specific actions even when there are active positions
    activePositionOverrides: [],
  },
};

export default POLICY_POSITION_ACTIONS_DEFAULT;
