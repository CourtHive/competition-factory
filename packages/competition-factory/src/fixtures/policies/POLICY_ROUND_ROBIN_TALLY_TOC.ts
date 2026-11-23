import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

export const POLICY_ROUND_ROBIN_TALLY_TOC = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'TOC Round Robin Tally',
    groupOrderKey: 'matchUpsPct',
    tallyDirectives: [
      { attribute: 'matchUpsPct', idsFilter: true, maxParticipants: 2 }, // Head to Head record among tied teams (only if the tie is between 2 teams)
      { attribute: 'gamesPct', idsFilter: false }, // Best winning percentage (total games won divided by total games played)
      { attribute: 'gamesWon', idsFilter: false }, // The team with the most games won.
      { attribute: 'gamesLost', idsFilter: false, reversed: true }, // The team with the least games lost.
    ],
    disqualifyDefaults: true, // disqualified participants are pushed to the bottom of the group order
    disqualifyWalkovers: true, // disqualified participants are pushed to the bottom of the group order
  },
};
