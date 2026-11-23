import { generateScoreString } from '@Scoring/views/generateScoreString';

// constants and types
import type { ScoreEntrySet } from './types';

/**
 * The score line, formatted by the factory's `generateScoreString` (CA, 2026-09-28: *"you should use
 * generateScoreString and not invent something new for the modal"*). A match tiebreak reads `[10-8]`.
 *
 * `setTBlast` stays at its default (the tiebreak last): when side 2 wins a set, `false` gives `6(3)-7`, the default
 * `6-7(3)`. `winningSide` is not passed, because `winnerFirst` would reorder the sides, and this line is in SIDE
 * order beneath rows labelled side 1 and side 2. `{ error }` and an empty string both answer nothing.
 */
export function scoreLine(sets: readonly ScoreEntrySet[], matchUpFormat?: string): string | undefined {
  if (!sets.length) return undefined;
  const result = generateScoreString({ sets, matchUpFormat });
  if (typeof result !== 'string') return undefined;
  return result || undefined;
}
