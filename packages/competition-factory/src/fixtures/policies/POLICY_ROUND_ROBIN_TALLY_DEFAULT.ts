import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';

export const POLICY_ROUND_ROBIN_TALLY_DEFAULT = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    policyName: 'Default Round Robin Tally',
    groupOrderKey: 'matchUpsWon', // possible to group by tieMatchUpsWon, tieSinglesWon, tieDoublesWon, matchUpsWon, pointsWon, gamesWon, setsWon, gamesPct, setsPct, pointsPct, matchUpsPct
    groupTotalGamesPlayed: false, // optional - when true will calculate % of games won based on total group games played rather than participant games played
    groupTotalSetsPlayed: false, // optional - when true will calculate % of sets won based on total group sets played rather than participant sets played
    headToHead: { disabled: false },
    tallyDirectives: [
      // these are the default values if no tallyDirectives provided; edit to suit
      // groupTotals scopes the tally calculations to all sets or games or matches played by all participants
      // idsFilter scopes the tally calculations to only tied participants
      // with { idsFilter: false } the ratio is calculated from all group matchUps
      // with { idsFilter: true } the ratio is calculated from matchUps including tied participants
      // when { maxParticipants: 2 } is defined, the rule only applies when # of participants is <= maxParticipants
      // any attribute/idsFilter combination can be selectively disabled for Head to Head calculations
      { attribute: 'matchUpsPct', idsFilter: false, groupTotals: false },
      { attribute: 'allDefaults', reversed: true, idsFilter: false }, // reversed: true => reverses default which is greatest to least
      { attribute: 'defaults', reversed: true, idsFilter: false },
      { attribute: 'walkovers', reversed: true, idsFilter: false },
      { attribute: 'retirements', reversed: true, idsFilter: false },
      { attribute: 'setsPct', idsFilter: false, groupTotals: false },
      { attribute: 'gamesPct', idsFilter: false, groupTotals: false },
      { attribute: 'pointsPct', idsFilter: false },
      { attribute: 'matchUpsPct', idsFilter: true, groupTotals: false },
      { attribute: 'setsPct', idsFilter: true, groupTotals: false },
      { attribute: 'gamesPct', idsFilter: true, groupTotals: false },
      { attribute: 'pointsPct', idsFilter: true },
    ],
    disqualifyDefaults: true, // disqualified participants are pushed to the bottom of the group order
    disqualifyWalkovers: true, // disqualified participants are pushed to the bottom of the group order
    excludeMatchUpStatuses: [], // matchUpStatuses to exclude from calculations, e.g. ABANDONED, INCOMPLETE
    setsCreditForDefaults: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent DEFAULT
    setsCreditForWalkovers: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent WALKOVER
    setsCreditForRetirements: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent RETIREMENT
    gamesCreditForDefaults: false, // whether or not to award e.g. 12 games won for participant who wins by opponent DEFAULT
    gamesCreditForWalkovers: false, // whether or not to award e.g. 12 games won for participant who wins by opponent WALKOVER
    gamesCreditForRetirements: false, // whether or not to award e.g. 2 sets won for participant who wins by opponent RETIREMENT
    gamesCreditForTiebreakSets: true, // defaults to true; whether to count a tiebreak set as a game won, e.g. 6-2 2-6 [10-3]
    GEMscore: ['matchUpsPct', 'tieMatchUpsPct', 'setsPct', 'gamesPct', 'pointsPct'],
  },
};
