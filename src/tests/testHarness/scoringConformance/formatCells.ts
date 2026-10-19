import type { FormatStructure, GameFormatStructure, SetFormatStructure } from '@Types/scoring/types';

/**
 * The scoring conformance matrix's coordinates (step 7 of the 2026-10-17 scoring-engine assessment).
 *
 * A cell is what the parser and the engine's dispatch distinguish about a format: the match spec,
 * the root, the kind and traits of the ordinary and the final segment, the game rule and a match
 * constraint. Two codes in one cell take the same scoring paths, so one set of independent
 * conformance cases covers both. A new grammar feature must add a coordinate here: `unknownKeys`
 * names every parsed key this file does not place, and the matrix gate fails on any.
 */

const FORMAT_KEYS = new Set([
  'bestOf',
  'exactly',
  'aggregate',
  'matchRoot',
  'matchMods',
  'setFormat',
  'finalSetFormat',
  'gameFormat',
  'matchUpConstraint',
  'simplified',
]);
const SET_KEYS = new Set([
  'combinedPointTotal',
  'tieResolution',
  'winningMargin',
  'setTo',
  'tiebreakAt',
  'tiebreakFormat',
  'noTiebreak',
  'NoAD',
  'winBy',
  'tiebreakSet',
  'timed',
  'minutes',
  'based',
  'modifier',
  'outs',
  'gameFormat',
]);
const TIEBREAK_KEYS = new Set(['tiebreakTo', 'modifier', 'NoAD']);
const GAME_KEYS = new Set(['type', 'count', 'deuceAfter', 'NoAD']);
const CONSTRAINT_KEYS = new Set(['timed', 'minutes']);

/** Every parsed key the matrix does not place, as a path: a grammar feature with no coordinate. */
export function unknownKeys(parsed: FormatStructure): string[] {
  const unknown: string[] = [];
  const check = (value: any, known: Set<string>, path: string) => {
    if (!value) return;
    for (const key of Object.keys(value)) if (!known.has(key)) unknown.push(`${path}.${key}`);
  };
  check(parsed, FORMAT_KEYS, 'format');
  for (const name of ['setFormat', 'finalSetFormat'] as const) {
    const set = parsed[name];
    check(set, SET_KEYS, name);
    check(set?.tiebreakFormat, TIEBREAK_KEYS, `${name}.tiebreakFormat`);
    check(set?.tiebreakSet, TIEBREAK_KEYS, `${name}.tiebreakSet`);
    check(set?.gameFormat, GAME_KEYS, `${name}.gameFormat`);
  }
  check(parsed.gameFormat, GAME_KEYS, 'gameFormat');
  check(parsed.matchUpConstraint, CONSTRAINT_KEYS, 'matchUpConstraint');
  return unknown;
}

function matchSpec(parsed: FormatStructure): string {
  if (parsed.simplified) return 'standalone';
  const count = parsed.exactly ? 'exactly' : 'bestOf';
  return parsed.aggregate ? `${count}+aggregate` : count;
}

/** The segment's kind and the traits that change how it is scored. */
export function segmentCell(set?: SetFormatStructure): string {
  if (!set) return 'none';
  if (set.outs) return 'outs';
  if (set.combinedPointTotal) return `combined(${set.tieResolution ?? 'ALLOW'})`;
  if (set.timed) {
    const traits = [set.based ?? 'G', set.modifier && `@${set.modifier}`, set.tiebreakFormat && 'tiebreak'];
    return `timed${traitList(traits)}`;
  }
  if (set.tiebreakSet) {
    const traits = [set.tiebreakSet.modifier && `@${set.tiebreakSet.modifier}`, set.tiebreakSet.NoAD && 'noAD'];
    return `tiebreakSet${traitList(traits)}`;
  }
  const hasTiebreak = !set.noTiebreak && (!!set.tiebreakFormat || typeof set.tiebreakAt === 'number');
  const early = hasTiebreak && typeof set.tiebreakAt === 'number' && set.tiebreakAt !== set.setTo;
  const traits = [
    hasTiebreak ? 'tiebreak' : 'advantage',
    early && 'earlyTiebreak',
    set.tiebreakFormat?.NoAD && 'tiebreakNoAD',
    set.NoAD && 'noAD',
    set.winBy !== undefined && `winBy${set.winBy}`,
    set.setTo === 1 && 'oneGame',
  ];
  return `standard${traitList(traits)}`;
}

function gameCell(game?: GameFormatStructure): string {
  if (!game) return 'traditional';
  if (game.type === 'CONSECUTIVE') return 'consecutive';
  return game.deuceAfter ? `traditional(deuceCap)` : 'traditional';
}

function traitList(traits: (string | false | undefined)[]): string {
  const present = traits.filter(Boolean);
  return present.length ? `(${present.join(',')})` : '';
}

/** The matrix cell a parsed format falls in. */
export function formatCell(parsed: FormatStructure): string {
  const final = parsed.finalSetFormat ? segmentCell(parsed.finalSetFormat) : 'same';
  const game = gameCell(parsed.gameFormat ?? parsed.setFormat?.gameFormat);
  return [
    matchSpec(parsed),
    parsed.matchRoot ?? 'SET',
    `set:${segmentCell(parsed.setFormat)}`,
    `final:${final}`,
    `game:${game}`,
    parsed.matchUpConstraint ? 'clock' : 'noClock',
    parsed.matchMods?.length ? 'unknownModifiers' : 'knownModifiers',
  ].join(' | ');
}
