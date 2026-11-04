import type { SetOutcome } from '../../testHarness/scoringConformance/conformance';
import { segmentConforms } from '../../testHarness/scoringConformance/segments';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, it } from 'vitest';

/*
 * Conformance: overtime (`-O:{count}[X][SD]/{segment}`) and its decider (activation S6), one code for every matrix
 * cell an overtime format falls in. Every expected outcome is written from the format definition, not recorded from
 * the engine:
 *
 * - documentation/docs/codes/matchup-format-grammar.md § 9 and codes/overtime/periods-and-limits.md: overtime is
 *   entered only when regulation ends level on aggregate; without X the running aggregate is checked after each
 *   period and the match ends when it is unequal; with X the block is played to its end before comparing; U repeats
 *   while level; SD ends the match on the score that breaks the tie; overtime goals add to the aggregate.
 * - § 9 and codes/overtime/shootouts-and-ties.md: at a finite ceiling a level total enters -F: when declared, and
 *   otherwise finishes level, with no winner; the decider's own result decides and is not summed; `F:TB1` is one
 *   sudden-death point; `F:SO{n}` is entered as its final tally.
 *
 * Readings, as aggregateSegments.conformance.test.ts reads them: a segment's units are its points (P) or games (G);
 * a timed segment closes when its time is up (`|`), and a goalless one is entered as its total (`S:0-0`); a one-point decider is recorded as a match tie-break
 * (`[1, 0, [1, 0]]`); a shootout tally is a set total (`S:4-3`).
 */

const END = '|';
/** A goalless segment: an unopened segment cannot be closed by `|`, so its total is entered. */
const NIL = 'S:0-0';
const seq = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

type Segment = { based?: string; timed?: boolean; tiebreakSet?: object; shootout?: number };

/** One unit to side 1 in a segment of this kind: a point, or a game in a games-based timed segment. */
const unit = (segment: Segment) => (segment.timed && segment.based !== 'P' ? 'g1' : '1');

function overtimeCases(code: string) {
  const parsed = parse(code)!;
  const n = parsed.exactly ?? parsed.bestOf ?? 1;
  const overtime = parsed.overtimeFormat!;
  const final = parsed.finalSetFormat as Segment | undefined;
  const regulationUnit = unit(parsed.setFormat as Segment);
  const overtimeUnit = unit(overtime.setFormat as Segment);
  const closed = (count: number) => Array.from({ length: count }, () => NIL);
  const level = (count: number): SetOutcome[] => Array.from({ length: count }, () => [0, 0]);

  // regulation: side 1 takes the first segment by one, every other segment is goalless
  const won = seq(regulationUnit, END, ...closed(n - 1));
  const wonSets: SetOutcome[] = [[1, 0], ...level(n - 1)];
  // regulation level: side 1 the first segment, side 2 the second (or, with one segment, nobody)
  const levelSpec = n > 1 ? seq(regulationUnit, END, regulationUnit.replace('1', '2'), END, ...closed(n - 2)) : NIL;
  const levelSets: SetOutcome[] = n > 1 ? [[1, 0], [0, 1], ...level(n - 2)] : [[0, 0]];

  // a decided regulation is the result: no overtime period is played
  segmentConforms(code, won, { sets: wonSets, winningSide: 1, complete: true });

  // a period scored by side 1: sudden death ends on the score, any other period at its end
  const scored = overtime.suddenDeath ? overtimeUnit : seq(overtimeUnit, END);
  const count = overtime.count === 'unlimited' ? undefined : overtime.count;

  if (overtime.exactly && count && count > 1) {
    // an exact block is a lead until it is played out
    segmentConforms(code, seq(levelSpec, scored), { sets: [...levelSets, [1, 0]], complete: false });
    segmentConforms(code, seq(levelSpec, scored, ...closed(count - 1)), {
      sets: [...levelSets, [1, 0], ...level(count - 1)],
      winningSide: 1,
      complete: true,
    });
  } else {
    // the first period that leaves the total unequal decides
    segmentConforms(code, seq(levelSpec, scored), { sets: [...levelSets, [1, 0]], winningSide: 1, complete: true });
  }

  if (count === undefined) {
    // unlimited: level periods repeat, then the first unequal one decides
    segmentConforms(code, seq(levelSpec, NIL, NIL), { sets: [...levelSets, [0, 0], [0, 0]], complete: false });
    segmentConforms(code, seq(levelSpec, NIL, NIL, scored), {
      sets: [...levelSets, [0, 0], [0, 0], [1, 0]],
      winningSide: 1,
      complete: true,
    });
    return;
  }

  // the ceiling reached level: the decider when declared, otherwise a level finish
  const ceiling = seq(levelSpec, ...closed(count));
  const ceilingSets: SetOutcome[] = [...levelSets, ...level(count)];
  if (!final) {
    segmentConforms(code, ceiling, { sets: ceilingSets, complete: true });
    return;
  }
  segmentConforms(code, ceiling, { sets: ceilingSets, complete: false });
  if (final.tiebreakSet) {
    segmentConforms(code, seq(ceiling, '1'), {
      sets: [...ceilingSets, [1, 0, [1, 0]]],
      winningSide: 1,
      complete: true,
    });
  } else if (final.shootout) {
    segmentConforms(code, seq(ceiling, 'S:4-3'), { sets: [...ceilingSets, [4, 3]], winningSide: 1, complete: true });
  } else {
    segmentConforms(code, seq(ceiling, unit(final), END), {
      sets: [...ceilingSets, [1, 0]],
      winningSide: 1,
      complete: true,
    });
  }
}

/** One code for every overtime cell of the conformance matrix (formatMatrix.ts). */
const CODES = [
  'HAL2XA-S:T45P-O:2/T15P',
  'HAL2XA-S:T45P-O:2X/T15P',
  'HAL2XA-S:T45P-O:2SD/T15P',
  'HAL2XA-S:T45P-O:2X/T15P-F:TB1',
  'HAL2XA-S:T45P-O:2/T15P-F:T10P',
  'HAL2XA-S:T45P-O:2X/T15P-F:SO5',
  'HAL2A-S:T10P-O:1/T5P-F:TB1',
  'QTR4XA-S:T12P-O:3/T5P',
  'QTR4XA-S:T12P-O:U/T5P',
  'PER3XA-S:T20P-O:1SD/T5P',
  'PER3XA-S:T20P-O:USD/T20P',
  'PER3XA-S:T20P-O:3/T5P-F:TB1',
  'PER3XA-S:T20P-O:1SD/T5P-F:TB1',
  'PER3XA-S:T20P-O:3/T5P-F:T10P',
  'PER3XA-S:T20-O:1/T5P-F:T20',
  'PER1A-S:T20P-O:1/T5P-F:TB1',
  'PER1A-S:T20P-O:1/T5P-F:T2P',
  'SET2XA-S:T40P-O:1/T10P',
  'SET2XA-S:T10P-O:1SD/T5P',
  'SET2XA-S:T45P-O:2X/T15P-F:TB1',
  'SET2XA-S:T45P-O:2X/T15P-F:TB1NOAD',
  'SET2XA-S:T45P-O:2/T15P-F:T5P',
  'SET3XA-S:T20P-O:1SD/T5P-F:TB1',
  'SET4XA-S:T12P-O:U/T5P',
  'SET3XA-S:T20P-O:USD/T20P',
  'SET2XA-S:T45P-O:2X/T15P-F:SO5',
  'SET2XA-S:T45P-O:2X/T15-F:SO5',
];

describe('Conformance: overtime and its decider', () => {
  it.each(CODES)('%s', (code) => overtimeCases(code));
});
