import { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { replaySets } from '@Scoring/kernel/setReplay';

// constants and types
import type { ScoreEntrySet } from './types';

/**
 * A combined-point total that allows a tie (`SET1-S:P32`) can end level, 16–16: COMPLETED with no winner (ties
 * are valid). The factory decides whether the set is over (`checkSetIsComplete` hands a
 * combined-point set to `analyzeCombinedPointSet`); this adds only that the format lets a tie stand and the totals are
 * level. A deciding-point or win-by format (`P32DP`, `P32WB2`) never ends level.
 */
export function isCompletedCombinedPointTie(sets: readonly ScoreEntrySet[], matchUpFormat?: string): boolean {
  const setFormat = parse(matchUpFormat ?? '')?.setFormat;
  if (!setFormat?.combinedPointTotal || setFormat.tieResolution !== 'ALLOW') return false;
  if (sets.length !== 1) return false;

  const [set] = sets;
  if (set.side1Score === undefined || set.side1Score !== set.side2Score) return false;
  return checkSetIsComplete({ set, matchUpFormat, isDecidingSet: true }) === true;
}

/**
 * A match the factory completes with no winner: the combined-point tie above, and an exactly or aggregate count that
 * closes level with no declared decider (`HAL2X-S:TB11` at one half each, `SET2XA-S:T10` level on games). The entered
 * sets are replayed as set totals through the scoring kernel, and the result is a tie when the match completes and
 * names no winner. A set the rules refuse or ignore (one past the close) is not a completed tie.
 */
export function isCompletedLevelClose(sets: readonly ScoreEntrySet[], matchUpFormat?: string): boolean {
  if (isCompletedCombinedPointTie(sets, matchUpFormat)) return true;
  if (!matchUpFormat || !sets.length || !parse(matchUpFormat)) return false;

  const totals: ScoreEntrySet[] = [];
  for (const set of sets) {
    const total = setTotal(set);
    if (!total) return false;
    totals.push(total);
  }

  // A set the rules refuse or ignore is not a tie, and nor is a set offered after the match completed, whatever the
  // rules make of it: the close is the last set.
  const replay = replaySets(matchUpFormat, totals);
  if (replay.refusedAt !== undefined || replay.ignoredAt !== undefined) return false;
  if (replay.completedAt !== undefined && replay.completedAt < totals.length - 1) return false;
  return replay.complete && replay.winningSide === undefined;
}

/**
 * A dialog set as the engine's set total. A tiebreak-only set (`[11-5]`) carries only its tiebreak scores; the
 * engine holds it as the segment won 1-0 with those points, as it does when it is scored.
 */
function setTotal(set: ScoreEntrySet): ScoreEntrySet | undefined {
  const { side1TiebreakScore: tb1, side2TiebreakScore: tb2 } = set;
  const tiebreaks = {
    ...(tb1 !== undefined && { side1TiebreakScore: tb1 }),
    ...(tb2 !== undefined && { side2TiebreakScore: tb2 }),
  };
  if (set.side1Score !== undefined && set.side2Score !== undefined) {
    return { side1Score: set.side1Score, side2Score: set.side2Score, ...tiebreaks };
  }
  if (tb1 === undefined || tb2 === undefined) return undefined;
  return { side1Score: tb1 > tb2 ? 1 : 0, side2Score: tb2 > tb1 ? 1 : 0, ...tiebreaks };
}
