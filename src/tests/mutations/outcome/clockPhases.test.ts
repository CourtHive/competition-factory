import { applyOutcomeOps, type OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';

afterEach(() => setClock());

it('writes a newly supplied format before the winner at the ordinary score boundary', () => {
  const matchUp: MatchUp = { matchUpId: 'source', matchUpStatus: 'TO_BE_PLAYED' };
  const codes: string[] = [];
  const draw: DrawDefinition = { drawId: 'draw', structures: [{ structureId: 'structure', matchUps: [matchUp] }] };
  applyOutcomeOps(
    draw,
    [
      {
        op: 'setMatchUpResult',
        matchUpId: 'source',
        matchUpStatus: 'COMPLETED',
        winningSide: 1,
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpStatusCodes: codes,
        stampsScoredTime: false,
      },
    ],
    undefined,
    { phase: 'ordinary-result' },
  );
  expect(Object.keys(matchUp)).toEqual([
    'matchUpId',
    'matchUpStatus',
    'matchUpFormat',
    'matchUpStatusCodes',
    'winningSide',
  ]);
  expect(matchUp.matchUpStatusCodes).toBe(codes);
});

it('projects an unknown scored time outside the record without reading the provider', () => {
  const matchUp: MatchUp = { matchUpId: 'source', matchUpStatus: 'TO_BE_PLAYED' };
  const draw: DrawDefinition = {
    drawId: 'draw',
    structures: [{ structureId: 'structure', matchUps: [matchUp] }],
  };
  const projection = { scoredTimes: new Set<string>(), updatedAt: new Set<string>() };
  let reads = 0;
  setClock(() => {
    reads++;
    throw new Error('planning read the live clock');
  });
  const ops: OutcomeOp[] = [
    { op: 'setMatchUpResult', matchUpId: 'source', matchUpStatus: 'COMPLETED', winningSide: 1 },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: 'source' },
    { op: 'stampUpdatedAt', entity: 'structure', id: 'structure' },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: 'draw' },
  ];
  expect(applyOutcomeOps(draw, ops, undefined, { temporal: projection })).toEqual({});
  expect(reads).toBe(0);
  expect(matchUp.schedule).toEqual({});
  expect(Object.hasOwn(matchUp.schedule!, 'scoredTime')).toBe(false);
  expect(Object.hasOwn(matchUp, 'updatedAt')).toBe(false);
  expect(projection.scoredTimes).toEqual(new Set(['source']));
  expect(projection.updatedAt).toEqual(new Set(['matchUp:source', 'structure:structure', 'drawDefinition:draw']));

  // A later clear removes the pending fact, while keeping the empty schedule v1 leaves behind.
  expect(
    applyOutcomeOps(draw, [{ op: 'setMatchUpResult', matchUpId: 'source', matchUpStatus: 'TO_BE_PLAYED' }], undefined, {
      temporal: projection,
    }),
  ).toEqual({});
  expect(projection.scoredTimes.size).toBe(0);
  expect(matchUp.schedule).toEqual({});
  expect(reads).toBe(0);
});
