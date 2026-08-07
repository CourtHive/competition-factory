// Competition format names
export const INTENNSE_STANDARD = 'INTENNSE_STANDARD';
export const TENNIS_STANDARD = 'TENNIS_STANDARD';

// Timeout scope
export const MATCHUP = 'MATCHUP';
export const SET = 'SET';
export const HALF = 'HALF';
export const SEGMENT = 'SEGMENT';

// Substitution timing
export const BETWEEN_GAMES = 'BETWEEN_GAMES';
export const BETWEEN_POINTS = 'BETWEEN_POINTS';
export const ANY = 'ANY';

export const competitionFormatConstants = {
  INTENNSE_STANDARD,
  TENNIS_STANDARD,
  MATCHUP,
  SET,
  HALF,
  SEGMENT,
  BETWEEN_GAMES,
  BETWEEN_POINTS,
  ANY,
} as const;

export default competitionFormatConstants;
