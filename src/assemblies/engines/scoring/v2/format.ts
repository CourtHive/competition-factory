import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { Pair } from './types';

/** the default format when neither the configuration nor the competition names one (§ 1.1) */
export const DEFAULT_MATCHUP_FORMAT = 'SET3-S:6/TB7';

/** a race to `to` points won by `margin` (§ 4.3): a tiebreak game, or a tiebreak-only set (§ 5) */
export type RaceRule = { to: number; margin: 1 | 2 };

/** how a game built from points is won (§ 3.5, § 4.1) */
export type GameRule = { kind: 'traditional'; deuceCap?: number } | { kind: 'consecutive'; run: number };

export type StandardRule = {
  kind: 'standard';
  setTo: number;
  winBy: number;
  /** the tiebreak at `at` games all, when one is declared (§ 4.2) */
  tiebreak?: { at: number; race: RaceRule };
  game: GameRule;
};

export type TiebreakOnlyRule = { kind: 'tiebreakOnly'; race: RaceRule; rally: boolean };

/**
 * A timed segment (§ 6): no target; only `endSegment` closes it. Its points build games of the match's game format
 * in a tennis-family timed set (games-based, SET root, not aggregate, not standalone: § 6.2 rule 2); everywhere
 * else a point is a unit of its score and adds its value (§ 6.2 rules 1, 3). `tiebreak` is the race played when it
 * is level at time (§ 6.4 rule 2).
 */
export type TimedRule = { kind: 'timed'; buildsGames: boolean; game: GameRule; tiebreak?: RaceRule; rally: boolean };

/** a combined total (§ 7): one segment of rallies that ends when both sides' points total `total` */
export type CombinedRule = {
  kind: 'combined';
  total: number;
  tie: 'ALLOW' | 'DECIDING_POINT' | 'WIN_BY_MARGIN';
  margin: number;
};

/** outs (§ 8): no point or game model; scored by set totals */
export type OutsRule = { kind: 'outs' };

export type SegmentRule = StandardRule | TiebreakOnlyRule | TimedRule | CombinedRule | OutsRule;

export type MatchRule = {
  code: string;
  /** best of N, or exactly N (§ 3.1) */
  mode: 'bestOf' | 'exactly';
  n: number;
  aggregate: boolean;
  /** sets a side needs in best of N (§ 9.1) */
  setsToWin: number;
  ordinary: SegmentRule;
  /** the final-segment format (`-F:`), when declared */
  final?: SegmentRule;
  /**
   * Replay only (§ 12.8): a stored timeline holds input v1 accepted past a completed match or past N. v1 played on:
   * no set limit, and a side wins on more sets (or the greater total) once N segments are closed (`legacy.ts`).
   */
  pastClose?: boolean;
};

/** the parsed shapes `parse` returns (its own type leaves set formats untyped): only the fields read here */
type ParsedTiebreak = { tiebreakTo: number; NoAD?: boolean; modifier?: string };
type ParsedSetFormat = {
  modifier?: string;
  combinedPointTotal?: number;
  tieResolution?: string;
  winningMargin?: number;
  based?: string;
  outs?: number;
  timed?: boolean;
  tiebreakSet?: ParsedTiebreak;
  tiebreakFormat?: ParsedTiebreak;
  tiebreakAt?: string | number;
  noTiebreak?: boolean;
  NoAD?: boolean;
  setTo?: number;
  winBy?: number;
};
type ParsedGameFormat = { type: string; count?: number; deuceAfter?: number };

/** the tiebreak margin: one when No-Ad or a race to one (sudden death), two otherwise (§ 4.3) */
export function raceRule(tiebreak: { tiebreakTo: number; NoAD?: boolean }): RaceRule {
  const margin = tiebreak.NoAD || tiebreak.tiebreakTo === 1 ? 1 : 2;
  return { to: tiebreak.tiebreakTo, margin };
}

/**
 * The game rule (§ 3.5, § 4.1). `-G:` is match-level; `NOAD` on the set makes a traditional game's first deuce
 * decisive, which is a deuce cap of one. A consecutive-points game has no deuce, so `NOAD` does not reach it.
 */
function gameRule(gameFormat: ParsedGameFormat | undefined, noAd: boolean): GameRule {
  if (gameFormat?.type === 'CONSECUTIVE') return { kind: 'consecutive', run: gameFormat.count ?? 1 };
  const caps = [gameFormat?.deuceAfter, noAd ? 1 : undefined].filter((cap): cap is number => cap !== undefined);
  return caps.length ? { kind: 'traditional', deuceCap: Math.min(...caps) } : { kind: 'traditional' };
}

/** a set format's kind, recognised in the order of § 3.3 */
/** what the match says about its timed sets: points build games only in a tennis-family timed set (§ 6.2) */
type MatchContext = { tennisFamily: boolean };

function combinedRule(setFormat: ParsedSetFormat): CombinedRule {
  const tie =
    setFormat.tieResolution === 'DECIDING_POINT' || setFormat.tieResolution === 'WIN_BY_MARGIN'
      ? setFormat.tieResolution
      : 'ALLOW';
  return { kind: 'combined', total: setFormat.combinedPointTotal ?? 0, tie, margin: setFormat.winningMargin ?? 2 };
}

function timedRule(
  setFormat: ParsedSetFormat,
  gameFormat: ParsedGameFormat | undefined,
  context: MatchContext,
): TimedRule {
  const buildsGames = context.tennisFamily && setFormat.based !== 'P';
  return {
    kind: 'timed',
    buildsGames,
    // `@RALLY` scores nothing differently in a timed set (§ 6.3); it changes service (§ 10.4)
    rally: setFormat.modifier === 'RALLY',
    game: gameRule(gameFormat, false),
    ...(setFormat.tiebreakFormat ? { tiebreak: raceRule(setFormat.tiebreakFormat) } : {}),
  };
}

function segmentRule(
  setFormat: ParsedSetFormat,
  gameFormat: ParsedGameFormat | undefined,
  context: MatchContext,
): SegmentRule {
  if (setFormat.combinedPointTotal !== undefined) return combinedRule(setFormat);
  if (setFormat.outs !== undefined) return { kind: 'outs' };
  if (setFormat.timed) return timedRule(setFormat, gameFormat, context);
  if (setFormat.tiebreakSet)
    return {
      kind: 'tiebreakOnly',
      race: raceRule(setFormat.tiebreakSet),
      rally: setFormat.tiebreakSet.modifier === 'RALLY',
    };
  const setTo = setFormat.setTo ?? 0;
  const game = gameRule(gameFormat, !!setFormat.NoAD);
  if (setFormat.noTiebreak || !setFormat.tiebreakFormat)
    return { kind: 'standard', setTo, winBy: setFormat.winBy ?? 2, game };
  const at = Number(setFormat.tiebreakAt ?? setTo);
  return { kind: 'standard', setTo, winBy: 2, tiebreak: { at, race: raceRule(setFormat.tiebreakFormat) }, game };
}

/**
 * The match a format code declares (§ 3.1), or undefined when the code does not parse: an engine is still built,
 * and every scoring and service action is refused (§ 1.1, § 2).
 *
 * Best of N needs a majority of the N, ⌊N/2⌋ + 1 sets. For odd N that is § 9.1's ⌈N/2⌉; for even N it is what
 * § 9.7 rule 4 requires (`SET2-S:6/TB7` can end 1-1), which ⌈N/2⌉ would not allow (decision SE2a-D7).
 */
export function resolveFormat(code: string | undefined): MatchRule | undefined {
  if (!code) return undefined;
  const parsed = parse(code);
  if (!parsed?.setFormat) return undefined;
  const exactly = parsed.exactly;
  const n: number = exactly ?? parsed.bestOf ?? 1;
  const context = { tennisFamily: !parsed.matchRoot && !parsed.aggregate && !parsed.simplified };
  const ordinary = segmentRule(parsed.setFormat, parsed.gameFormat, context);
  const final = parsed.finalSetFormat ? segmentRule(parsed.finalSetFormat, parsed.gameFormat, context) : undefined;
  return {
    code,
    mode: exactly ? 'exactly' : 'bestOf',
    n,
    aggregate: !!parsed.aggregate,
    setsToWin: Math.floor(n / 2) + 1,
    ordinary,
    ...(final ? { final } : {}),
  };
}

/** the configured format: the option, else the competition's, else the default (§ 1.1) */
export function configuredFormat(config: {
  matchUpFormat?: string;
  competitionFormat?: { matchUpFormat?: string };
}): string {
  return config.matchUpFormat ?? config.competitionFormat?.matchUpFormat ?? DEFAULT_MATCHUP_FORMAT;
}

/**
 * Whether the final-segment format governs set `setNumber` (§ 3.2), given the sets each side has won before it.
 *
 * 1. best of N: the deciding set read from the score (both sides one set from winning), and set N whatever the
 *    count when it starts;
 * 2. exactly N, not aggregate: set N;
 * 3. exactly N, aggregate: set N + 1, the decider (§ 9.4).
 *
 * Best of N with aggregate (`SET3A`) is not named by § 3.2: sets won are never consulted there (§ 9.3), so only
 * "set N" of rule 1 applies (decision SE2a-D1).
 */
export function finalGoverns(match: MatchRule, setNumber: number, setsWon: Pair): boolean {
  if (match.mode === 'exactly') return setNumber === (match.aggregate ? match.n + 1 : match.n);
  if (setNumber === match.n) return true;
  if (match.aggregate) return false;
  const oneFromWinning = match.setsToWin - 1;
  return setsWon[0] === oneFromWinning && setsWon[1] === oneFromWinning;
}

/** the rule governing set `setNumber` (§ 3.2) */
export function ruleForSet(match: MatchRule, setNumber: number, setsWon: Pair): SegmentRule {
  return match.final && finalGoverns(match, setNumber, setsWon) ? match.final : match.ordinary;
}

/** whether `rule` is a segment kind that takes `input` (§ 3.3): outs take only set totals; a combined total no game */
export function takesInput(rule: SegmentRule, input: 'point' | 'game'): boolean {
  if (rule.kind === 'outs') return false;
  return !(input === 'game' && rule.kind === 'combined');
}
