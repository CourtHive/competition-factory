/**
 * Warnings a SUCCESSFUL score write can carry — the score was recorded, and something about it is worth
 * knowing. Each names the sets it concerns in `setNumbers`.
 */

// A set decided by its tiebreak was recorded on games alone: `7-6` with no tiebreak points. Accepted
// because it is so prevalent in results feeds (CA, 2026-10-02, ruling V11); the points are simply unknown.
export const TIEBREAK_POINTS_NOT_RECORDED = 'TIEBREAK_POINTS_NOT_RECORDED';

// `repairScore` dropped tiebreak points no tiebreak could end on, keeping the games (ruling V12): the
// ingestion fallback, never applied to a live entry.
export const INVALID_TIEBREAK_POINTS_DROPPED = 'INVALID_TIEBREAK_POINTS_DROPPED';

export const scoreWarningConstants = {
  INVALID_TIEBREAK_POINTS_DROPPED,
  TIEBREAK_POINTS_NOT_RECORDED,
};
