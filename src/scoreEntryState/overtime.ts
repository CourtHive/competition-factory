import { parse } from '@Helpers/matchUpFormatCode/parse';
import { replaySets } from '@Scoring/kernel/setReplay';

// constants and types
import type { MatchUpConfig, ScoreEntrySet, SetFormat } from './types';
import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

/**
 * Score entry for an OVERTIME format (`-O:{count}[X][SD]/{segment}`): regulation, extra periods while the aggregate is
 * level, then a decider (`-F:TB1`, or a shootout `-F:SO{n}` entered as its tally).
 *
 * How many periods a match plays depends on the score: an exact block (`O:2X`) is played to its end, an ordinary
 * period only while the total is level, a sudden-death period ends on its first goal, unlimited overtime has no
 * ceiling. Rather than keep a second copy of that rule, the entered sets are replayed through the scoring kernel
 * (`replaySets`, the path `ScoringEngine.addSet` takes), which says whether the match is decided, who won, what the
 * next set is played to, and refuses a set that could not have been played, with the reason.
 *
 * Which segment governs set k is grammar, not a decision: regulation for the first N, the overtime segment within
 * the ceiling, then `-F:`.
 */

type FormatInput = string | ParsedFormat | MatchUpConfig | undefined;

export type OvertimeProgress = {
  /** the rules call the match decided (a level finish under a finite ceiling with no decider is decided too) */
  complete: boolean;
  winningSide?: 1 | 2;
  /** the format of the next set, while the match is undecided */
  next?: SetFormat;
  /** why the rules refused a set, which is then the first set they did not take */
  refused?: string;
  refusedAt?: number;
};

/** What a set after the match was decided is reported as: the rules ignore it rather than refusing it. */
export const PLAYED_AFTER_DECIDED = 'played after the match was decided';

function parsedOf(format: FormatInput): (ParsedFormat & MatchUpConfig) | undefined {
  if (!format) return undefined;
  return (typeof format === 'string' ? parse(format) : format) as (ParsedFormat & MatchUpConfig) | undefined;
}

/** Whether the format plays overtime (`-O:`). */
export function isOvertimeFormat(format: FormatInput): boolean {
  return !!parsedOf(format)?.overtimeFormat;
}

function regulationOf(parsed: { exactly?: number; bestOf?: number }): number {
  return parsed.exactly ?? parsed.bestOf ?? 1;
}

/** How many sets an overtime format can hold: regulation, the ceiling and the decider; `undefined` when unlimited. */
export function overtimeSetCeiling(format: FormatInput): number | undefined {
  const parsed = parsedOf(format);
  const overtime = parsed?.overtimeFormat;
  if (!parsed || !overtime || overtime.count === 'unlimited') return undefined;
  return regulationOf(parsed) + (overtime.count ?? 0) + (parsed.finalSetFormat ? 1 : 0);
}

/** The segment set `setNumber` is played to: regulation, an overtime period, or the decider. */
export function overtimeSetFormat(format: FormatInput, setNumber: number): SetFormat | undefined {
  const parsed = parsedOf(format);
  if (!parsed?.overtimeFormat) return undefined;
  const regulation = regulationOf(parsed);
  const { count, setFormat } = parsed.overtimeFormat;
  if (setNumber <= regulation) return parsed.setFormat;
  if (count === 'unlimited' || setNumber <= regulation + (count ?? 0)) return setFormat as SetFormat;
  return parsed.finalSetFormat;
}

export type OvertimePhase =
  { phase: 'REGULATION' } | { phase: 'OVERTIME'; period: number } | { phase: 'DECIDER'; shootout: boolean };

/** Where set `setNumber` falls: regulation, an overtime period (numbered from 1), or the decider. */
export function overtimePhaseOf(format: FormatInput, setNumber: number): OvertimePhase | undefined {
  const parsed = parsedOf(format);
  if (!parsed?.overtimeFormat) return undefined;
  const regulation = regulationOf(parsed);
  const { count } = parsed.overtimeFormat;
  if (setNumber <= regulation) return { phase: 'REGULATION' };
  if (count === 'unlimited' || setNumber <= regulation + (count ?? 0)) {
    return { phase: 'OVERTIME', period: setNumber - regulation };
  }
  return { phase: 'DECIDER', shootout: parsed.finalSetFormat?.shootout !== undefined };
}

/** The set number of the decider (`-F:`), or `undefined` when there is none. */
export function overtimeDeciderSetNumber(format: FormatInput): number | undefined {
  const parsed = parsedOf(format);
  const ceiling = overtimeSetCeiling(parsed);
  return ceiling !== undefined && parsed?.finalSetFormat ? ceiling : undefined;
}

/**
 * The scoring rules' reading of these CLOSED sets, in order. A set is offered with its principal score and, for a
 * one-point decider, its points; the rules read whichever its segment takes.
 */
export function overtimeProgress(matchUpFormat: string | undefined, sets: readonly ScoreEntrySet[]): OvertimeProgress {
  const replay = replaySets(matchUpFormat, sets);
  if (replay.ignoredAt !== undefined) {
    return { complete: false, refused: PLAYED_AFTER_DECIDED, refusedAt: replay.ignoredAt };
  }
  if (replay.refusedAt !== undefined) return { complete: false, refused: replay.refused, refusedAt: replay.refusedAt };
  if (replay.complete) return { complete: true, winningSide: replay.winningSide };
  return { complete: false, next: replay.setInPlayFormat as SetFormat | undefined };
}
