export const NORMAL = 'normal';
export const TIMED = 'timed';
export const FINAL = 'final';
export const NOAD = 'NOAD';
export const SET = 'SET';

// Set-format modifier — the `@` suffix on a tiebreak set (e.g. `SET3-S:TB11@RALLY`).
// RALLY is scoring-significant: every rally scores a point regardless of who served, which is why
// the scoring engine skips server derivation for it. Its absence means traditional side-out
// scoring, in which only the serving side can score — expressed by omitting the modifier, not by a
// counterpart constant.
export const RALLY = 'RALLY';

// Multi-root support for cross-sport scalability
export const MATCH_ROOTS = ['SET', 'HAL', 'QTR', 'PER', 'INN', 'RND', 'FRM', 'MAP', 'MAT'] as const;
export type MatchRoot = (typeof MATCH_ROOTS)[number];

// Game format types
export const CONSECUTIVE = 'CONSECUTIVE';
export const TRADITIONAL = 'TRADITIONAL';

// Section types
export const GAME = 'game';
export const MATCHUP = 'matchUp';

export const sectionTypes = {
  S: NORMAL,
  F: FINAL,
  G: GAME,
  M: MATCHUP,
};
