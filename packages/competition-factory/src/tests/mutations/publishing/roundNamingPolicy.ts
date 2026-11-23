import { MAIN, PLAY_OFF, CONSOLATION, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';

export const ROUND_NAMING_POLICY = {
  [POLICY_TYPE_ROUND_NAMING]: {
    policyName: 'Round Naming Default',
    roundNamingMap: {
      1: 'Final',
      2: 'Semifinals',
      4: 'Quarterfinals',
    },
    affixes: {
      roundNumber: 'R',
      preFeedRound: 'Q',
    },
    stageConstants: {
      [MAIN]: '',
      [PLAY_OFF]: 'P',
      [QUALIFYING]: 'Q',
      [CONSOLATION]: 'C',
    },
  },
};

export default ROUND_NAMING_POLICY;
