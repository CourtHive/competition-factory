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
  'overtimeFormat',
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
  'shootout',
  'gameFormat',
]);
const TIEBREAK_KEYS = new Set(['tiebreakTo', 'modifier', 'NoAD']);
const GAME_KEYS = new Set(['type', 'count', 'deuceAfter', 'NoAD']);
const CONSTRAINT_KEYS = new Set(['timed', 'minutes']);
const OVERTIME_KEYS = new Set(['count', 'exactly', 'suddenDeath', 'setFormat']);

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
  check(parsed.overtimeFormat, OVERTIME_KEYS, 'overtimeFormat');
  check(parsed.overtimeFormat?.setFormat, SET_KEYS, 'overtimeFormat.setFormat');
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
  // its own coordinate (Ruling 3): a tally-only final, harvested since overtime opened for new use (S6)
  if (set.shootout) return 'shootout';
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

/**
 * An overtime format's coordinate (activation S6): how many periods (a finite ceiling or unlimited), whether a block
 * is played out (X) or ends on the first score (SD), and the period's own segment. A shootout decider is the final
 * segment's `shootout` coordinate.
 */
function overtimeCell(overtime: NonNullable<FormatStructure['overtimeFormat']>): string {
  const traits = [overtime.exactly && 'exactly', overtime.suddenDeath && 'suddenDeath'];
  const count = overtime.count === 'unlimited' ? 'unlimited' : 'finite';
  return `overtime:${count}${traitList(traits)}/${segmentCell(overtime.setFormat)}`;
}

/** The matrix cell a parsed format falls in. */
export function formatCell(parsed: FormatStructure): string {
  const final = parsed.finalSetFormat ? segmentCell(parsed.finalSetFormat) : 'same';
  const game = gameCell(parsed.gameFormat ?? parsed.setFormat?.gameFormat);
  return [
    matchSpec(parsed),
    parsed.matchRoot ?? 'SET',
    `set:${segmentCell(parsed.setFormat)}`,
    // only an overtime format carries the coordinate, so no cell without -O: changes its id
    ...(parsed.overtimeFormat ? [overtimeCell(parsed.overtimeFormat)] : []),
    `final:${final}`,
    `game:${game}`,
    parsed.matchUpConstraint ? 'clock' : 'noClock',
    parsed.matchMods?.length ? 'unknownModifiers' : 'knownModifiers',
  ].join(' | ');
}
