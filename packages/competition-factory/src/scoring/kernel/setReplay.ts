import { overtimeLayout, scoringPeriod } from '@Helpers/matchUpFormatCode/overtimeContext';
import { createContext, initialState, positionOf, step } from './reduce';
import { finalGoverns } from '@Helpers/matchUpFormatCode/matchRule';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { DEFAULT_MATCHUP_FORMAT } from './format';
import { setsWon } from './decide';

// constants and types
import type { SetFormatStructure } from '@Types/scoring/types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ReducerContext } from './reduce';
import type { ScoringState } from './types';

/**
 * Set totals replayed through the scoring kernel, with no `ScoringEngine` around them.
 *
 * Score entry asks the scoring rules three things about the sets an operator has typed: is the match decided, who
 * won it, and what is the next set played to. `ScoringEngine.addSet` answers by offering each set to the kernel's
 * `step`; so does this, with the same context and the same `live` flag, so the answers cannot differ. What the
 * engine adds around `step` (a timeline, timestamps, a materialized record, statistics, events) is not needed to
 * answer them, and it is what reads the engine's clock and global state, which `tods-competition-factory/
 * score-entry-state` must never reach.
 *
 * The replay stops at the first set the rules do not take: refused (an impossible set, with the rule's message, which
 * the engine throws) or ignored (a set after the match was decided, which the engine reports as not recorded).
 */

/** one set total as score entry holds it: the principal score and, for a one-point decider, its points */
export type ReplayedSet = {
  side1Score?: number;
  side2Score?: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
};

export type SetReplay = {
  /** the rules call the match decided; a level finish under a finite ceiling with no decider is decided too */
  complete: boolean;
  winningSide?: 1 | 2;
  /** the index of the first set the rules refused, and their reason */
  refusedAt?: number;
  refused?: string;
  /** the index of the first set the rules ignored (`MATCH_COMPLETED`: played after the match was decided) */
  ignoredAt?: number;
  ignored?: string;
  /** the index of the set that completed the match, where one did */
  completedAt?: number;
  /** the format of the set in play, while the match is undecided and every set was taken */
  setInPlayFormat?: SetFormatStructure;
};

/** The context `ScoringEngine` reduces a fresh match with: its format, no multipliers, overtime allowed. */
export function setReplayContext(matchUpFormat?: string): ReducerContext {
  return createContext({ matchUpFormat: matchUpFormat || DEFAULT_MATCHUP_FORMAT }, { allowOvertime: true });
}

/**
 * `sets` offered in order as set totals, exactly as `ScoringEngine.addSet` offers them. A missing principal score is
 * offered as 0, which is how score entry has always handed a set to the engine.
 */
export function replaySets(matchUpFormat: string | undefined, sets: readonly ReplayedSet[]): SetReplay {
  const context = setReplayContext(matchUpFormat);
  let state = initialState();
  let completedAt: number | undefined;

  for (const [index, set] of sets.entries()) {
    const data = {
      side1Score: set.side1Score ?? 0,
      side2Score: set.side2Score ?? 0,
      ...(set.side1TiebreakScore !== undefined && { side1TiebreakScore: set.side1TiebreakScore }),
      ...(set.side2TiebreakScore !== undefined && { side2TiebreakScore: set.side2TiebreakScore }),
    };
    const { outcome, state: next } = step(context, state, { type: 'set', data }, true);
    if ('refused' in outcome) return { complete: false, refusedAt: index, refused: outcome.refused.message };
    if ('ignored' in outcome) return { complete: false, ignoredAt: index, ignored: outcome.ignored };
    if (completedAt === undefined && next.matchUpStatus === COMPLETED) completedAt = index;
    state = next;
  }

  const complete = state.matchUpStatus === COMPLETED;
  const winner = state.winningSide;
  const winningSide = winner === 1 || winner === 2 ? winner : undefined;
  if (complete) return { complete, winningSide, completedAt };
  return { complete, setInPlayFormat: setInPlayFormat(matchUpFormat || DEFAULT_MATCHUP_FORMAT, context, state) };
}

/**
 * The format of the set in play: regulation, an overtime period or the decider under an overtime format, otherwise
 * the final set's format where it governs. `ScoringEngine.getSetInPlayFormat` answers with this.
 */
export function setInPlayFormat(
  matchUpFormat: string,
  context: ReducerContext,
  state: ScoringState,
): SetFormatStructure | undefined {
  const structure = parse(matchUpFormat);
  const match = context.match;
  if (!structure || !match) return undefined;
  const closed = state.sets.filter((set) => set.winningSide || set.segmentComplete);
  const setNumber = Math.min(positionOf(match, state).set.setNumber, Math.max(closed.length + 1, 1));
  const layout = overtimeLayout(structure);
  if (layout) {
    const current = state.matchUpStatus === COMPLETED ? (state.sets.at(-1)?.setNumber ?? 1) : setNumber;
    const period = scoringPeriod(layout, current);
    if (period?.phase === 'OVERTIME') return structure.overtimeFormat?.setFormat;
    return period?.phase === 'DECIDER' ? structure.finalSetFormat : structure.setFormat;
  }
  const final = finalGoverns(match, setNumber, setsWon(state.sets.slice(0, setNumber - 1)));
  return final && structure.finalSetFormat ? structure.finalSetFormat : structure.setFormat;
}
