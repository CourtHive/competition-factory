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

/** a kind SE2a does not score yet: timed, combined total, outs (SE2b) */
export type DeferredRule = { kind: 'timed' | 'combined' | 'outs' };

export type SegmentRule = StandardRule | TiebreakOnlyRule | DeferredRule;

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
};

/** the parsed shapes `parse` returns (its own type leaves set formats untyped): only the fields read here */
type ParsedTiebreak = { tiebreakTo: number; NoAD?: boolean; modifier?: string };
type ParsedSetFormat = {
  combinedPointTotal?: number;
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
function segmentRule(setFormat: ParsedSetFormat, gameFormat: ParsedGameFormat | undefined): SegmentRule {
  if (setFormat.combinedPointTotal !== undefined) return { kind: 'combined' };
  if (setFormat.outs !== undefined) return { kind: 'outs' };
  if (setFormat.timed) return { kind: 'timed' };
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
  const ordinary = segmentRule(parsed.setFormat, parsed.gameFormat);
  const final = parsed.finalSetFormat ? segmentRule(parsed.finalSetFormat, parsed.gameFormat) : undefined;
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

/** whether every segment the format declares is a kind SE2a scores: standard and tiebreak-only */
export function isSE2aFormat(match: MatchRule | undefined): boolean {
  if (!match) return true;
  const scored = new Set(['standard', 'tiebreakOnly']);
  return scored.has(match.ordinary.kind) && (!match.final || scored.has(match.final.kind));
}
