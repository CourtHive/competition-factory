import { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { isOvertimeFormat, overtimeProgress, overtimeSetFormat } from './overtime';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import {
  getMaxSetScore,
  getSetComplement,
  getTiebreakComplement,
} from '@Helpers/matchUpFormatCode/setRules/setComplement';

// constants and types
import type { MatchUpConfig, ScoreEntrySet, SetFormat, SideNumber } from './types';

/**
 * The format questions score entry asks, each DELEGATED to the factory's scoring rules.
 *
 * CA, 2026-09-27: *"why would we hand roll something? The factory should export all the logic we'd need for scoring
 * interfaces"*. Every answer here is `analyzeSet`, `analyzeMatchUp`, `checkSetIsComplete`, the set and tiebreak
 * complements or the set ceiling; this module only assembles their arguments from a parsed format. Moved here from
 * courthive-components' `dynamicSetsLogic.ts`, which re-exports it unchanged.
 */

type Scores = { side1?: number; side2?: number; tiebreak?: number };

/** What an unparseable or missing format falls back to: a real format, so its set rules still answer. */
export const DEFAULT_MATCH_UP_FORMAT = 'SET3-S:6/TB7';

/**
 * The `MatchUpConfig` for a matchUpFormat code. Never parse a format with a regex: the factory owns that grammar.
 * An unparseable code falls back to `SET3-S:6/TB7` rather than throwing, because a score dialog that will not open is
 * worse than one that opens on the wrong best-of — and the fallback carries a real set format, without which
 * `analyzeSet` has no opinion about who won a 6-4.
 */
export function matchUpConfigFor(matchUpFormat?: string): MatchUpConfig {
  const parsed = matchUpFormat ? parse(matchUpFormat) : undefined;
  const effective = parsed ?? parse(DEFAULT_MATCH_UP_FORMAT);

  return {
    bestOf: bestOfFor(parsed),
    exactly: effective?.exactly,
    aggregate: effective?.aggregate,
    setFormat: effective?.setFormat,
    finalSetFormat: effective?.finalSetFormat,
    ...(effective?.overtimeFormat && { overtimeFormat: effective.overtimeFormat }),
  };
}

/** A format's set count as `bestOf`: an `exactly` format's count, and 3 when nothing parses. */
function bestOfFor(parsed: { bestOf?: number; exactly?: number } | undefined): number {
  if (!parsed) return 3;
  return parsed.bestOf || parsed.exactly || 3;
}

/** The set object and scoring format `analyzeSet` expects, from this module's argument shapes. */
function setAnalysis(setIndex: number, scores: Scores, config: MatchUpConfig) {
  const analyze = (extra: Record<string, number>) =>
    analyzeSet({
      setObject: { setNumber: setIndex + 1, side1Score: scores.side1, side2Score: scores.side2, ...extra },
      matchUpScoringFormat: config,
    });

  // The set format comes from a first pass: completing the tiebreak pair needs the target, and the deciding-set rule
  // decides which format applies. One extra call keeps the deciding-set logic in the factory.
  const setFormat = scores.tiebreak === undefined ? undefined : (analyze({}).setFormat as SetFormat | undefined);
  return analyze(tiebreakSides(scores, setFormat));
}

/**
 * Both tiebreak scores, from the one this module carries: the LOSER's points. `analyzeSet` and `checkSetIsComplete`
 * read both, and with one present they call a 7-6(3) unfinished, so the winner's points are derived with the
 * factory's own `getTiebreakComplement` rather than the delegation being abandoned.
 */
function tiebreakSides(scores: Scores, setFormat?: SetFormat): Record<string, number> {
  if (scores.tiebreak === undefined) return {};

  const loserIsSide1 = (scores.side1 ?? 0) < (scores.side2 ?? 0);
  const tiebreakTo = setFormat?.tiebreakFormat?.tiebreakTo ?? setFormat?.tiebreakSet?.tiebreakTo;

  if (tiebreakTo === undefined) {
    // No target to complete against: hand over what is known rather than inventing the other side.
    return loserIsSide1 ? { side1TiebreakScore: scores.tiebreak } : { side2TiebreakScore: scores.tiebreak };
  }

  const pair = getTiebreakComplement({
    lowValue: scores.tiebreak,
    tiebreakTo,
    tiebreakNoAd: setFormat?.tiebreakFormat?.NoAD ?? setFormat?.tiebreakSet?.NoAD,
    isSide1: loserIsSide1,
  });
  if (!pair) return {};

  const [forSide1, forSide2] = pair;
  return { side1TiebreakScore: forSide1, side2TiebreakScore: forSide2 };
}

/**
 * The factory's winner of a tiebreak-only set, given its POINTS as points. `getSetWinner` would hand them over as
 * games, which a tiebreak-only format has no rule for.
 */
function tiebreakOnlyWinner(
  setIndex: number,
  scores: { side1?: number; side2?: number },
  config: MatchUpConfig,
): SideNumber | undefined {
  if (scores.side1 === undefined || scores.side2 === undefined) return undefined;
  const { winningSide } = analyzeSet({
    setObject: { setNumber: setIndex + 1, side1TiebreakScore: scores.side1, side2TiebreakScore: scores.side2 },
    matchUpScoringFormat: config,
  });
  return winningSide === 1 || winningSide === 2 ? winningSide : undefined;
}

/** The format set `setIndex` is played to; `analyzeSet` applies the deciding-set rule itself. */
export function getSetFormatForIndex(setIndex: number, config: MatchUpConfig): SetFormat | undefined {
  // an overtime period is played to the overtime segment
  if (isOvertimeFormat(config)) return overtimeSetFormat(config, setIndex + 1);
  return setAnalysis(setIndex, {}, config).setFormat as SetFormat | undefined;
}

/** Whether a set is played as a tiebreak alone (`TB10`). */
export function isSetTiebreakOnly(format?: SetFormat): boolean {
  return format?.tiebreakSet?.tiebreakTo !== undefined;
}

/** Whether a set is timed (`T10`, `T20`). */
export function isSetTimed(format?: SetFormat): boolean {
  return format?.timed === true && format?.minutes !== undefined;
}

/**
 * The highest score one side may enter, given the opponent's: `getMaxSetScore` for a games set, the tiebreak
 * complement for a tiebreak-only set, the set's margin for an advantage set. An opponent score of 0 means "not
 * entered yet" and allows the format's ceiling.
 */
export function getMaxAllowedScore(
  setIndex: number,
  side: SideNumber,
  currentScores: { side1: number; side2: number },
  config: MatchUpConfig,
): number {
  const setFormat = getSetFormatForIndex(setIndex, config);

  // For timed sets, there is no maximum score: scores need no relationship to each other
  if (isSetTimed(setFormat)) return Infinity;

  const oppScore = side === 1 ? currentScores.side2 : currentScores.side1;
  const opponentEntered = oppScore > 0;

  // A tiebreak-only set is scored in points: the winner's points are the complement of the loser's
  if (isSetTiebreakOnly(setFormat)) {
    const tiebreakTo = setFormat?.tiebreakSet?.tiebreakTo as number;
    const pair = getTiebreakComplement({
      lowValue: opponentEntered ? oppScore : 0,
      tiebreakTo,
      tiebreakNoAd: setFormat?.tiebreakSet?.NoAD,
    });
    return pair ? Math.max(...pair) : tiebreakTo;
  }

  const setTo = setFormat?.setTo ?? 6;
  const max = getMaxSetScore({
    opponentScore: opponentEntered ? oppScore : undefined,
    tiebreakAt: setFormat?.tiebreakAt,
    winBy: setFormat?.winBy,
    NoAD: setFormat?.NoAD,
    setTo,
  });
  if (max !== undefined) return max;

  // No ceiling from the format (an advantage set): the set's margin decides
  if (!opponentEntered) return setTo + 1;
  return oppScore >= setTo - 1 ? oppScore + 2 : setTo;
}

/** Whether a set is complete: the factory's rule, with the winner's tiebreak points derived from the loser's. */
export function isSetComplete(
  setIndex: number,
  scores: { side1: number; side2: number; tiebreak?: number },
  config: MatchUpConfig,
): boolean {
  const setFormat = getSetFormatForIndex(setIndex, config);

  // A timed set is complete when both sides have values; the scores need no relationship
  if (isSetTimed(setFormat)) {
    return scores.side1 !== undefined && scores.side1 !== null && scores.side2 !== undefined && scores.side2 !== null;
  }

  if (isSetTiebreakOnly(setFormat)) return tiebreakOnlyWinner(setIndex, scores, config) !== undefined;

  const complete = checkSetIsComplete({
    set: {
      setNumber: setIndex + 1,
      side1Score: scores.side1,
      side2Score: scores.side2,
      ...tiebreakSides(scores, setFormat),
    },
    matchUpScoringFormat: { setFormat },
  });
  return complete === true;
}

/** Which side won a set, or `undefined` while it is not complete. */
export function getSetWinner(
  setIndex: number,
  scores: { side1: number; side2: number; tiebreak?: number },
  config: MatchUpConfig,
): SideNumber | undefined {
  const winningSide = setAnalysis(setIndex, scores, config).winningSide;
  return winningSide === 1 || winningSide === 2 ? winningSide : undefined;
}

/**
 * The factory's analysis of a whole matchUp. `analyzeMatchUp` reads a matchUpFormat CODE, so the config is
 * stringified back; that round-trips faithfully, measured across `SET3-S:6/TB7`, `SET3-S:6/TB7-F:TB10`,
 * `SET1-S:TB10`, `SET5-S:6/TB7` and `SET1-S:5WB1`.
 */
function matchAnalysis(sets: readonly ScoreEntrySet[], config: MatchUpConfig) {
  return analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat: formatOf(config) } });
}

/** The matchUpFormat code a config was parsed from. */
function formatOf(config: MatchUpConfig): string | undefined {
  return stringify(config);
}

/** Whether the match is decided: an overtime format where the scoring rules decide it, otherwise by sets won. */
export function isMatchComplete(sets: readonly ScoreEntrySet[], config: MatchUpConfig): boolean {
  if (isOvertimeFormat(config)) return overtimeProgress(formatOf(config), sets).complete;
  return !!matchAnalysis(sets, config).calculatedWinningSide;
}

/** The match winner, or `undefined` while it is not decided. */
export function getMatchWinner(sets: readonly ScoreEntrySet[], config: MatchUpConfig): SideNumber | undefined {
  if (isOvertimeFormat(config)) return overtimeProgress(formatOf(config), sets).winningSide;
  const winningSide = matchAnalysis(sets, config).calculatedWinningSide;
  return winningSide === 1 || winningSide === 2 ? winningSide : undefined;
}

/**
 * The smart complement of a typed games score: the factory's `getSetComplement`, or `null` where no single answer
 * exists. The SET's own `NoAD` is the flag it consults, not the tiebreak's.
 */
export function calculateComplement(digit: number, setFormat?: SetFormat): number | null {
  if (!setFormat?.setTo) return null;

  const pair = getSetComplement({
    lowValue: digit,
    setTo: setFormat.setTo,
    tiebreakAt: setFormat.tiebreakAt,
    NoAD: setFormat.NoAD,
    winBy: setFormat.winBy,
    isSide1: true,
  });
  if (!pair) return null;

  const complement = pair[1];
  // A complement equal to the typed value says nothing was inferred
  return complement === undefined || complement === digit ? null : complement;
}

/**
 * Whether a set's games say it went to a tiebreak whose points are owed: a tiebreak condition AND a side ahead out
 * of it. `hasTiebreakCondition` alone is true at 6-6, where the tiebreak is being played and no result exists yet.
 */
export function shouldShowTiebreak(
  setIndex: number,
  scores: { side1: number; side2: number },
  config: MatchUpConfig,
): boolean {
  const analysis = setAnalysis(setIndex, scores, config);
  return !!analysis.hasTiebreakCondition && !!analysis.leadingSide;
}

/**
 * Both sides' tiebreak points from the LOSER's, on the side the games say lost: the factory's `getTiebreakComplement`,
 * as a keystroke derives them (`typeDigit`). With no tiebreak in the set's format there is no target to complete
 * against, so only the points typed are recorded, as `tiebreakSides` does; nothing is invented.
 */
function tiebreakPair(lowValue: number, side1WonGames: boolean, setFormat?: SetFormat): Partial<ScoreEntrySet> {
  const loserField = side1WonGames ? 'side2TiebreakScore' : 'side1TiebreakScore';
  const tiebreakTo = setFormat?.tiebreakFormat?.tiebreakTo;
  if (tiebreakTo === undefined) return { [loserField]: lowValue };

  const pair = getTiebreakComplement({
    lowValue,
    tiebreakTo,
    tiebreakNoAd: setFormat?.tiebreakFormat?.NoAD,
    isSide1: !side1WonGames,
  });
  if (!pair) return { [loserField]: lowValue };

  const [side1TiebreakScore, side2TiebreakScore] = pair;
  return { side1TiebreakScore, side2TiebreakScore };
}

/** A factory set from typed values, with its winner and, from the loser's tiebreak points, the winner's. */
export function buildSetScore(
  setIndex: number,
  side1Value: string,
  side2Value: string,
  tiebreakValue: string | undefined,
  config: MatchUpConfig,
): ScoreEntrySet {
  const side1Score = Number.parseInt(side1Value) || 0;
  const side2Score = Number.parseInt(side2Value) || 0;
  const tiebreakScore = tiebreakValue ? Number.parseInt(tiebreakValue) : undefined;

  const setFormat = getSetFormatForIndex(setIndex, config);

  if (isSetTiebreakOnly(setFormat)) {
    // The cells are points; the winner is the factory's answer, not "whoever is ahead"
    const winningSide = tiebreakOnlyWinner(setIndex, { side1: side1Score, side2: side2Score }, config);
    return {
      setNumber: setIndex + 1,
      side1Score: 0,
      side2Score: 0,
      side1TiebreakScore: side1Score,
      side2TiebreakScore: side2Score,
      winningSide,
    };
  }

  const scores = { side1: side1Score, side2: side2Score, tiebreak: tiebreakScore };
  const winningSide = getSetWinner(setIndex, scores, config);
  const setData: ScoreEntrySet = { setNumber: setIndex + 1, side1Score, side2Score, winningSide };

  if (tiebreakScore !== undefined)
    Object.assign(setData, tiebreakPair(tiebreakScore, side1Score > side2Score, setFormat));

  return setData;
}
