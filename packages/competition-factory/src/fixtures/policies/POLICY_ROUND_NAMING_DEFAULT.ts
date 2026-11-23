import { MAIN, PLAY_OFF, CONSOLATION, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';

export const POLICY_ROUND_NAMING_DEFAULT = {
  [POLICY_TYPE_ROUND_NAMING]: {
    policyName: 'Round Naming Default',
    namingConventions: {
      round: 'Round',
      pre: 'Pre',
    },
    qualifyingFinishMap: {
      1: 'Final',
    },
    abbreviatedRoundNamingMap: {
      // key is matchUpsCount for the round
      1: 'F',
      2: 'SF',
      4: 'QF',
    },
    roundNamingMap: {
      1: 'Final',
      2: 'Semifinal',
      4: 'Quarterfinal',
    },
    affixes: {
      roundNumber: 'R',
      preFeedRound: 'Q',
      preQualifying: 'P',
    },
    stageConstants: {
      [MAIN]: '',
      [PLAY_OFF]: 'P',
      [QUALIFYING]: 'Q',
      [CONSOLATION]: 'C',
    },
  },
};

export default POLICY_ROUND_NAMING_DEFAULT;
