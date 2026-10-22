/**
 * matchCompletion - when a match is over, and who won it
 *
 * The completion rule of the scoring engine spec (§ 9), for the pure scorer (`addPoint`). The ScoringEngine's
 * reducer holds its own (`v2/decide.ts`), and v1's replay rule went with v1 (SE4).
 */

import type { FormatStructure, MatchUp, SetScore } from '@Types/scoring/types';
import { isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import { nowIso } from '@Tools/clock';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

type Completion = { complete: false } | { complete: true; winningSide?: 1 | 2 };

const NOT_COMPLETE: Completion = { complete: false };

/** A set that is over: won, or a timed segment closed with or without a winner. */
function isClosedSet(set: SetScore): boolean {
  return set.winningSide !== undefined || !!(set as SetScore & { segmentComplete?: boolean }).segmentComplete;
}

function countSetsWon(sets: SetScore[]): [number, number] {
  const setsWon: [number, number] = [0, 0];
  for (const set of sets) {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  }
  return setsWon;
}

/** The side with more, or none when level. */
function sideAhead(counts: [number, number]): 1 | 2 | undefined {
  if (counts[0] === counts[1]) return undefined;
  return counts[0] > counts[1] ? 1 : 2;
}

/**
 * A segment's total in an aggregate format: a tiebreak-only segment's points, and a timed segment's own
 * score, even when a tiebreak at time decided it (§ 9.3 rule 3).
 */
export function aggregateTotals(sets: SetScore[]): [number, number] {
  const totals: [number, number] = [0, 0];
  for (const set of sets) {
    if (!set.isTimed && set.side1TiebreakScore !== undefined && set.side2TiebreakScore !== undefined) {
      totals[0] += set.side1TiebreakScore;
      totals[1] += set.side2TiebreakScore;
    } else {
      totals[0] += set.side1Score ?? 0;
      totals[1] += set.side2Score ?? 0;
    }
  }
  return totals;
}

/**
 * The completion rule (spec § 9, CA 2026-10-18). A match that ends level with no declared decider is
 * complete with no winner (§ 9.7): the engine never plays a segment the format did not declare.
 *
 * - best of N (§ 9.1): the first to ⌈N/2⌉ sets wins; once all N sets are closed (a timed segment closed
 *   level counts as played) the side with more sets wins, and a level count is a tie;
 * - exactly N (§ 9.2): once all N are closed the side with more sets wins, however many; level is a tie;
 * - aggregate (§ 9.3, § 9.4): after N segments the total decides; a level total waits for the declared
 *   decider (`-F:` of an exactly-N aggregate, set N + 1), and is otherwise a tie, as it is when the
 *   decider itself closes level.
 */
export function matchCompletion(matchUp: MatchUp, formatStructure: FormatStructure, setsToWin: number): Completion {
  const sets = matchUp.score.sets;
  const exactly = formatStructure.exactly;
  const setCount = exactly || formatStructure.bestOf || 3;

  if (isAggregateFormat(formatStructure)) {
    // every segment counts toward the N, a level one included
    if (sets.length < setCount) return NOT_COMPLETE;
    const winningSide = sideAhead(aggregateTotals(sets));
    if (winningSide) return { complete: true, winningSide };
    const deciderDeclared = !!exactly && !!formatStructure.finalSetFormat;
    if (deciderDeclared && sets.length === setCount) return NOT_COMPLETE;
    return { complete: true };
  }

  const setsWon = countSetsWon(sets);
  if (!exactly && (setsWon[0] >= setsToWin || setsWon[1] >= setsToWin)) {
    return { complete: true, winningSide: setsWon[0] > setsWon[1] ? 1 : 2 };
  }
  if (sets.filter(isClosedSet).length < setCount) return NOT_COMPLETE;
  return { complete: true, winningSide: sideAhead(setsWon) };
}

/**
 * Check match completion and finalize if complete. A match that ends level is `COMPLETED` with no
 * `winningSide` (§ 9.7).
 */
export function checkAndFinalizeMatch(matchUp: MatchUp, formatStructure: FormatStructure, setsToWin: number): void {
  const completion = matchCompletion(matchUp, formatStructure, setsToWin);
  if (!completion.complete) return;
  matchUp.matchUpStatus = COMPLETED;
  if (completion.winningSide) matchUp.winningSide = completion.winningSide;
  else delete matchUp.winningSide;
  matchUp.endTime = nowIso();
}
