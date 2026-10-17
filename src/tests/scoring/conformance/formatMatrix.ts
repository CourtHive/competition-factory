import type { MatrixEntry } from '../../testHarness/scoringConformance/formatMatrixTypes';

/**
 * The scoring conformance matrix (step 7, phase A, of the 2026-10-17 scoring-engine assessment): every
 * cell the factory's own formats fall in, and how it is held to the rules. Generated from the
 * harvested formats, then classified by hand; formatMatrix.test.ts fails on a cell missing from here,
 * on an entry no format reaches, and on a classification that does not hold.
 *
 * - `conformance`: independent cases, written from the governing rule, name the files that hold them.
 * - `refused`: point and game input are refused by design; the reason says what takes their place.
 * - `missing`: no independent conformance case yet. Phase B works this list down.
 */

const MISSING: MatrixEntry = { status: 'missing' };
const STANDARD_SETS: MatrixEntry = {
  status: 'conformance',
  cases: ['src/tests/scoring/conformance/standardSets.conformance.test.ts'],
};
const OUTS = 'a segment of outs takes set totals (addSet); point and game input are refused (S4, #5518)';

export const FORMAT_MATRIX: Record<string, MatrixEntry> = {
  'bestOf | FRM | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | MAP | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:combined(ALLOW) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:combined(DECIDING_POINT) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:combined(WIN_BY_MARGIN) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:outs | final:same | game:traditional | noClock | knownModifiers': {
    status: 'refused',
    reason: OUTS,
  },
  'bestOf | SET | set:standard(advantage,noAD,winBy1) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(advantage,noAD) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(advantage,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(advantage,winBy1) | final:same | game:consecutive | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(advantage,winBy1) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(advantage,winBy1) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(advantage) | final:same | game:consecutive | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(advantage) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(advantage) | final:standard(advantage) | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak,noAD) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak,tiebreakNoAD,noAD) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak,tiebreakNoAD) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,earlyTiebreak) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,noAD) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak,noAD) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,oneGame) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak,tiebreakNoAD,noAD) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak,tiebreakNoAD) | final:same | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:outs | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:same | game:consecutive | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | clock | knownModifiers': STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | noClock | knownModifiers': STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:same | game:traditional | noClock | unknownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:same | game:traditional(deuceCap) | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:standard(advantage) | game:traditional | noClock | knownModifiers':
    STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:standard(tiebreak,earlyTiebreak) | game:traditional | noClock | knownModifiers':
    STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:standard(tiebreak) | game:traditional | noClock | knownModifiers':
    STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:tiebreakSet | game:traditional | noClock | knownModifiers':
    STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:tiebreakSet | game:traditional(deuceCap) | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:tiebreakSet(noAD) | game:traditional | noClock | knownModifiers':
    STANDARD_SETS,
  'bestOf | SET | set:standard(tiebreak) | final:timed(G) | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:standard(tiebreak) | final:timed(P) | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:tiebreakSet | final:tiebreakSet | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:tiebreakSet(@RALLY,noAD) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:tiebreakSet(@RALLY,noAD) | final:tiebreakSet(@RALLY,noAD) | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:tiebreakSet(@RALLY) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:tiebreakSet(@RALLY) | final:tiebreakSet(@RALLY) | game:traditional | noClock | knownModifiers':
    MISSING,
  'bestOf | SET | set:tiebreakSet(noAD) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G,@RALLY) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G,tiebreak) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G) | final:same | game:traditional(deuceCap) | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G) | final:timed(G) | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(G) | final:timed(G) | game:traditional(deuceCap) | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(P,tiebreak) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | HAL | set:outs | final:same | game:traditional | noClock | knownModifiers': {
    status: 'refused',
    reason: OUTS,
  },
  'bestOf+aggregate | HAL | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | PER | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | QTR | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | RND | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | SET | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'bestOf+aggregate | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | HAL | set:tiebreakSet | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | INN | set:standard(tiebreak) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | SET | set:timed(P,tiebreak) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | SET | set:timed(P) | final:timed(G) | game:traditional | noClock | knownModifiers': MISSING,
  'exactly | SET | set:timed(P) | final:timed(P) | game:traditional | noClock | knownModifiers': MISSING,
  'exactly+aggregate | INN | set:outs | final:same | game:traditional | clock | knownModifiers': {
    status: 'refused',
    reason: OUTS,
  },
  'exactly+aggregate | INN | set:outs | final:same | game:traditional | noClock | knownModifiers': {
    status: 'refused',
    reason: OUTS,
  },
  'exactly+aggregate | INN | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly+aggregate | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'exactly+aggregate | SET | set:timed(G) | final:tiebreakSet | game:traditional | noClock | knownModifiers': MISSING,
  'exactly+aggregate | SET | set:timed(G) | final:tiebreakSet(noAD) | game:traditional | noClock | knownModifiers':
    MISSING,
  'exactly+aggregate | SET | set:timed(G) | final:timed(P) | game:traditional | noClock | knownModifiers': MISSING,
  'exactly+aggregate | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'standalone | SET | set:timed(G) | final:same | game:traditional | noClock | knownModifiers': MISSING,
  'standalone | SET | set:timed(P) | final:same | game:traditional | noClock | knownModifiers': MISSING,
};
