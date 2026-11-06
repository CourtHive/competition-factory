import { missingDrawPositionsRefusal, isUndirectedDrawnOutcome } from '@Query/matchUp/missingDrawPositionsRefusal';
import { MISSING_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { expect, it } from 'vitest';

const cases: [string, Record<string, any>, boolean, boolean][] = [
  ['first winner without positions', {}, false, true],
  ['first winner with active downstream', {}, true, true],
  ['empty drawPositions is present', { matchUp: { drawPositions: [] } }, false, false],
  ['populated drawPositions', { matchUp: { drawPositions: [1, 2] } }, false, false],
  ['collection line', { matchUp: { collectionId: 'c' } }, false, false],
  ['ad hoc structure', { structure: { structureId: 's', matchUps: [] } }, false, false],
  ['existing winner', { matchUp: { winningSide: 2 } }, false, false],
  ['existing double walkover', { matchUp: { matchUpStatus: 'DOUBLE_WALKOVER' } }, false, false],
  ['existing double default', { matchUp: { matchUpStatus: 'DOUBLE_DEFAULT' } }, false, false],
  ['no directing request', { winningSide: undefined }, false, false],
  [
    'score without a winner',
    { winningSide: undefined, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } },
    false,
    false,
  ],
  ['exit not propagated', { winningSide: undefined, matchUpStatus: 'WALKOVER' }, false, false],
  ['propagated exit', { winningSide: undefined, matchUpStatus: 'WALKOVER', propagateExitStatus: true }, false, true],
  [
    'double exit is not a single propagated exit',
    { winningSide: undefined, matchUpStatus: 'DOUBLE_DEFAULT', propagateExitStatus: true },
    false,
    false,
  ],
  [
    'empty incoming status',
    { winningSide: undefined, matchUpStatus: 'TO_BE_PLAYED', propagateExitStatus: true },
    false,
    false,
  ],
];

it.each(cases)(
  'preserves the existing missing-position predicate: %s',
  (_name, overrides, activeDownstream, refused) => {
    const params: any = {
      drawDefinition: { drawId: 'd' },
      matchUpId: 'm',
      winningSide: 1,
      ...overrides,
      matchUp: { matchUpId: 'm', matchUpStatus: 'TO_BE_PLAYED', ...overrides.matchUp },
    };
    const before = structuredClone(params);
    const result = missingDrawPositionsRefusal({ params, activeDownstream });
    expect(result).toEqual(refused ? { error: MISSING_DRAW_POSITIONS, stack: ['setMatchUpStatus'] } : undefined);
    expect(params).toEqual(before);
  },
);

it.each([
  ['completed round-robin draw', {}, false, true],
  ['default completed status', { matchUpStatus: undefined }, false, true],
  ['ad hoc draw', { structure: { structureId: 's', matchUps: [] } }, false, true],
  ['active downstream', {}, true, false],
  ['winner named', { winningSide: 1 }, false, false],
  ['in-progress tie', { matchUpStatus: 'IN_PROGRESS' }, false, false],
  ['unequal points', { score: { sets: [{ setNumber: 1, side1Score: 17, side2Score: 15 }] } }, false, false],
  [
    'directed bracket',
    { structure: { structureId: 's', matchUps: [{ drawPositions: [1, 2], roundPosition: 1 }] } },
    false,
    false,
  ],
  [
    'incoming format overrides stored format',
    { matchUpFormat: 'SET1-S:P32', matchUp: { matchUpFormat: 'SET3-S:6/TB7' } },
    false,
    true,
  ],
] as const)('recognizes the existing undirected drawn result: %s', (_name, overrides, activeDownstream, expected) => {
  const params: any = {
    drawDefinition: { drawId: 'd' },
    structure: {
      structureId: 's',
      finishingPosition: 'WIN_RATIO',
      matchUps: [{ drawPositions: [1, 2], roundPosition: 1 }],
    },
    matchUp: { matchUpFormat: 'SET1-S:P32' },
    matchUpStatus: 'COMPLETED',
    score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] },
    ...overrides,
  };
  const before = structuredClone(params);
  expect(isUndirectedDrawnOutcome(params, activeDownstream)).toBe(expected);
  expect(params).toEqual(before);
});

it('accepts an undirected rotating-partner draw through its competition profile', () => {
  const params: any = {
    drawDefinition: {
      drawId: 'd',
      drawType: 'AD_HOC',
      matchUpType: 'DOUBLES',
      competitionProfile: {
        version: 1,
        format: 'AMERICANO',
        entrantScope: 'INDIVIDUAL',
        matchUpType: 'DOUBLES',
        scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'ALLOW' } },
        standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
        pairing: { seed: 42, algorithmVersion: 1 },
        completion: { kind: 'PARTNERSHIP_COVERAGE' },
      },
    },
    // A position-bearing structure deliberately does not take the ad-hoc exemption.
    structure: { structureId: 's', matchUps: [{ drawPositions: [1, 2], roundPosition: 1 }] },
    matchUp: { matchUpFormat: 'SET1-S:P32' },
    score: { sets: [{ setNumber: 1, side1Score: 16, side2Score: 16 }] },
  };
  const before = structuredClone(params);
  expect(isUndirectedDrawnOutcome(params, false)).toBe(true);
  expect(params).toEqual(before);
});
