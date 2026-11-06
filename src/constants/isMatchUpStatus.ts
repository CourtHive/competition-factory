// constants and types
import { validMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

const MATCHUP_STATUSES = new Set<string>(validMatchUpStatuses);

/**
 * Whether a value is a matchUpStatus the engine knows.
 *
 * A validator takes its status as `string` because it checks what a caller hands it; this is where the
 * check happens. An unknown status is never an error by itself in a comparison, only a match that
 * never succeeds, so a validator that skipped this would call `'COMPLETD'` an open match.
 */
export function isMatchUpStatus(value: unknown): value is MatchUpStatusUnion {
  return typeof value === 'string' && MATCHUP_STATUSES.has(value);
}
