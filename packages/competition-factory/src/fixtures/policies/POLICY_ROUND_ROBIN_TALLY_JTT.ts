import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

export const POLICY_ROUND_ROBIN_TALLY_JTT = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'JTT Round Robin Tally',
    groupOrderKey: 'gamesWon',
    tallyDirectives: [
      { attribute: 'matchUpsPct', idsFilter: true }, // Head-to-head team match win/loss record between the tied teams
      { attribute: 'gamesWon', idsFilter: false }, // A win is determined by most games won
      { attribute: 'matchUpsWon', idsFilter: false }, // The team with the most team matches won in the round robin flight
      { attribute: 'tieMatchUpsWon', idsFilter: false }, // The team with the most individual (singles or doubles) matches won in the round robin flight
      { attribute: 'setsWon', idsFilter: false }, // The team with the most sets won in the round robin flight
    ],
    disqualifyDefaults: true, // disqualified participants are pushed to the bottom of the group order
    disqualifyWalkovers: true, // disqualified participants are pushed to the bottom of the group order
  },
};
