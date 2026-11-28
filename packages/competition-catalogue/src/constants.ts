/**
 * The core vocabulary the catalogue's entries are written in: each value is the one the factory defines under the
 * same name. The catalogue copies them so that it holds plain data and imports nothing from the engine.
 */

// drawDefinitionConstants
export const CLUSTER = 'CLUSTER';
export const COMPASS = 'COMPASS';
export const CONSOLATION = 'CONSOLATION';
export const CURTIS_CONSOLATION = 'CURTIS_CONSOLATION';
export const FEED_IN_CHAMPIONSHIP = 'FEED_IN_CHAMPIONSHIP';
export const FEED_IN_CHAMPIONSHIP_TO_QF = 'FEED_IN_CHAMPIONSHIP_TO_QF';
export const FEED_IN_CHAMPIONSHIP_TO_R16 = 'FEED_IN_CHAMPIONSHIP_TO_R16';
export const FEED_IN_CHAMPIONSHIP_TO_SF = 'FEED_IN_CHAMPIONSHIP_TO_SF';
export const FIRST_MATCH_LOSER_CONSOLATION = 'FIRST_MATCH_LOSER_CONSOLATION';
export const MAIN = 'MAIN';
export const MODIFIED_FEED_IN_CHAMPIONSHIP = 'MODIFIED_FEED_IN_CHAMPIONSHIP';
export const PLAY_OFF = 'PLAY_OFF';
export const QUALIFYING = 'QUALIFYING';
export const ROUND_ROBIN = 'ROUND_ROBIN';
export const ROUND_ROBIN_WITH_PLAYOFF = 'ROUND_ROBIN_WITH_PLAYOFF';
export const SINGLE_ELIMINATION = 'SINGLE_ELIMINATION';
export const VOLUNTARY_CONSOLATION = 'VOLUNTARY_CONSOLATION';

// entryStatusConstants
export const WITHDRAWN = 'WITHDRAWN';

// eventConstants
export const DOUBLES = 'DOUBLES';
export const SINGLES = 'SINGLES';
export const TEAM_EVENT = 'TEAM';

// matchUpStatusConstants
export const ABANDONED = 'ABANDONED';
export const CANCELLED = 'CANCELLED';
export const DEFAULTED = 'DEFAULTED';
export const INCOMPLETE = 'INCOMPLETE';
export const RETIRED = 'RETIRED';
export const WALKOVER = 'WALKOVER';

// officiatingConstants
export const CONFLICT_BLOCK = 'BLOCK';
export const CONFLICT_DECLARED_RELATIONSHIP = 'DECLARED_RELATIONSHIP';
export const CONFLICT_NATIONALITY = 'NATIONALITY';
export const CONFLICT_ORGANISATION = 'ORGANISATION';
export const CONFLICT_SAME_PERSON = 'SAME_PERSON';
export const CONFLICT_SHARED_GROUPING = 'SHARED_GROUPING';
export const CONFLICT_WARN = 'WARN';
export const EVALUATION_SCALE_OPTIONS = [
  {
    value: 1,
    label: 'Unsatisfactory',
  },
  {
    value: 2,
    label: 'Below Average',
  },
  {
    value: 3,
    label: 'Average',
  },
  {
    value: 4,
    label: 'Good',
  },
  {
    value: 5,
    label: 'Excellent',
  },
] as const;

// participantRoles
export const COACH = 'COACH';
export const MEDICAL = 'MEDICAL';
export const PHYSIO = 'PHYSIO';
export const TRAINER = 'TRAINER';

// pointsAuthorityConstants
export const ATP = 'ATP';
export const ITF = 'ITF';
export const ITF_JUNIOR = 'ITF_JUNIOR';
export const WTA = 'WTA';

// policyConstants
export const POLICY_TYPE_OFFICIATING_CONFLICT = 'officiatingConflict';
export const POLICY_TYPE_PROGRESSION = 'progression';
export const POLICY_TYPE_RANKING_POINTS = 'rankingPoints';
export const POLICY_TYPE_RATINGS = 'ratings';
export const POLICY_TYPE_ROUND_ROBIN_TALLY = 'roundRobinTally';
export const POLICY_TYPE_SCORING = 'scoring';
export const POLICY_TYPE_SEEDING = 'seeding';

// seasonConstants
export const STANDINGS_PURPOSE_ADVANCEMENT = 'ADVANCEMENT';
export const STANDINGS_PURPOSE_MOVEMENT = 'MOVEMENT';

// matchUpFormats
export const FORMAT_STANDARD = 'SET3-S:6/TB7';
