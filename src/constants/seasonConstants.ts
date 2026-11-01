/**
 * Vocabulary of the CODES `Season` document. See `@Types/seasonTypes` and the concept page
 * documentation/docs/concepts/season.md.
 */

// the lifecycle of one edition of a Series
export const SEASON_DECLARED = 'DECLARED';
export const SEASON_ACTIVE = 'ACTIVE';
export const SEASON_CLOSED = 'CLOSED';
export const SEASON_ABANDONED = 'ABANDONED';

// what a season's standings are kept for: a person (personId) or a team (a durable team id)
export const SUBJECT_PERSON = 'PERSON';
export const SUBJECT_TEAM = 'TEAM';

// the phases a period may declare; free text is allowed beyond these
export const PHASE_REGULAR = 'REGULAR';
export const PHASE_PLAYOFF = 'PLAYOFF';
export const PHASE_CHAMPIONSHIP = 'CHAMPIONSHIP';

// how subjects advance out of a period into a later competition (within the season, R10)
export const ADVANCE_TOP_N = 'TOP_N';
// berths that scale with the tier's size: NC 1/2/3 at 0/30/45 teams, Georgia JTT's per-10 or per-4 formulas
export const ADVANCE_BERTHS_BY_SIZE = 'BERTHS_BY_SIZE';

// what a season table is computed for: a tally policy's directives may apply only for some purposes (A8)
export const STANDINGS_PURPOSE_MOVEMENT = 'MOVEMENT';
export const STANDINGS_PURPOSE_ADVANCEMENT = 'ADVANCEMENT';

export const seasonConstants = {
  SEASON_STATUS: {
    DECLARED: SEASON_DECLARED,
    ACTIVE: SEASON_ACTIVE,
    CLOSED: SEASON_CLOSED,
    ABANDONED: SEASON_ABANDONED,
  },
  SUBJECT_TYPE: { PERSON: SUBJECT_PERSON, TEAM: SUBJECT_TEAM },
  PHASE: { REGULAR: PHASE_REGULAR, PLAYOFF: PHASE_PLAYOFF, CHAMPIONSHIP: PHASE_CHAMPIONSHIP },
  ADVANCEMENT_RULE: { TOP_N: ADVANCE_TOP_N, BERTHS_BY_SIZE: ADVANCE_BERTHS_BY_SIZE },
  STANDINGS_PURPOSE: { MOVEMENT: STANDINGS_PURPOSE_MOVEMENT, ADVANCEMENT: STANDINGS_PURPOSE_ADVANCEMENT },
} as const;
