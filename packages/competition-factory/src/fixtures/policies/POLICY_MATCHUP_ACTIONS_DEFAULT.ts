import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';

export const POLICY_MATCHUP_ACTIONS_DEFAULT = {
  [POLICY_TYPE_MATCHUP_ACTIONS]: {
    policyName: 'matchUpActionsDefault',

    // matchUpActions will be selectively enabled for structures matching { stages: [], stageSequences: [] }
    // enabledStructures: [] => all structures are enabled
    enabledStructures: [
      {
        stages: [], // stages: [] => applies to all stages
        stageSequences: [], // stageSequences: [] => applies to all stageSequences
        enabledActions: [],
        disabledActions: [], // disabledActions: [] => no actions are disabled
      },
    ],

    participants: {
      enforceCategory: true, // validate collectionDefinition.category against event.category
      enforceGender: true, // disallow placing FEMALEs in MALE events and vice versa
    },

    processCodes: {
      substitution: ['RANKING.IGNORE', 'RATING.IGNORE'],
    },

    substituteAfterCompleted: false,
    substituteWithoutScore: false,
  },
};

export default POLICY_MATCHUP_ACTIONS_DEFAULT;
