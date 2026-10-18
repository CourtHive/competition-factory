/**
 * matchCompletion - when a match is over, and who won it
 *
 * The completion rule of the scoring engine spec (§ 9), and v1's rule beside it for the replay of a
 * timeline v1 wrote (§ 12.8).
 */

import type { FormatStructure, MatchUp, SetScore } from '@Types/scoring/types';
import { isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import { nowIso } from '@Tools/clock';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/** The legacy shape a rebuild met: v1 scored past a level close (spec § 12.8). */
export const SCORING_PAST_LEVEL_CLOSE = 'scoringPastLevelClose';

/** The timeline entries that score: a stored one past a level close proves v1 wrote it (§ 12.8). */
const SCORING_ENTRY_TYPES = new Set(['point', 'game', 'set', 'endSegment']);

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
function aggregateTotals(sets: SetScore[]): [number, number] {
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
 * v1's completion rule, kept for the replay of a timeline v1 wrote (§ 12.8): a level aggregate total,
 * a level count and a best of N without a side at ⌈N/2⌉ all stay in play, so v1 played on.
 */
export function v1MatchCompletion(matchUp: MatchUp, formatStructure: FormatStructure, setsToWin: number): Completion {
  const sets = matchUp.score.sets;
  const exactly = formatStructure.exactly;

  if (isAggregateFormat(formatStructure)) {
    if (sets.length < (exactly || formatStructure.bestOf || 3)) return NOT_COMPLETE;
    const winningSide = sideAhead(aggregateTotals(sets));
    return winningSide ? { complete: true, winningSide } : NOT_COMPLETE;
  }

  const setsWon = countSetsWon(sets);
  if (setsWon[0] < setsToWin && setsWon[1] < setsToWin) return NOT_COMPLETE;
  if (exactly) {
    if (sets.filter((set) => set.winningSide !== undefined).length < exactly) return NOT_COMPLETE;
    if (setsWon[0] === setsWon[1]) return NOT_COMPLETE;
  }
  return { complete: true, winningSide: setsWon[0] > setsWon[1] ? 1 : 2 };
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

/** Whether any timeline entry after `index` scores. */
export function scoresAfter(entries: { type: string }[], index: number): boolean {
  return entries.slice(index + 1).some((entry) => SCORING_ENTRY_TYPES.has(entry.type));
}

/**
 * The replay of a timeline v1 wrote (spec § 12.8, decided 2026-10-18): refusals apply at the action
 * boundary only. When a replayed entry completes the match by a rule v1 did not have (a level close, or
 * all N sets played with no side at ⌈N/2⌉) and the timeline scores after it, v1 wrote those entries
 * playing on, so the match is put back in play as v1 left it. Once met, the shape holds to the end of
 * the timeline: every later completion is v1's.
 *
 * Returns whether the match was put back in play.
 */
export function replayAsV1(params: {
  matchUp: MatchUp;
  formatStructure: FormatStructure | undefined;
  wasComplete: boolean;
  scoresLater: boolean;
  legacy: boolean;
}): boolean {
  const { matchUp, formatStructure, wasComplete, scoresLater, legacy } = params;
  if (!formatStructure || wasComplete || matchUp.matchUpStatus !== COMPLETED) return false;
  if (formatStructure.setFormat?.combinedPointTotal) return false;
  if (!legacy && !scoresLater) return false;
  const setsToWin = Math.ceil((formatStructure.exactly || formatStructure.bestOf || 3) / 2);
  if (v1MatchCompletion(matchUp, formatStructure, setsToWin).complete) return false;
  matchUp.matchUpStatus = IN_PROGRESS;
  delete matchUp.winningSide;
  delete matchUp.endTime;
  return true;
}
