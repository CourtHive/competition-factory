import { applyOutcomeOps, nextStamp } from '@Mutate/matchUps/outcome/ops';
import { normaliseStamps } from '@Mutate/matchUps/outcome/shadow';
import { afterEach, describe, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import type { DrawDefinition } from '@Types/tournamentTypes';
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The S1 op reducer and its stamps (outcome v2 executor plan § 3.3; F2 (i), CA 2026-10-19).
 *
 * The reducer folds ops into a stored-shape draw and decides nothing. Its stamp rule is F2 (i): one per touched entity
 * per call, the call's instant T, or the previous stamp + 1 ms when that is already as late. v1 keeps the same rule for
 * the draw and its matchUps, which `differential` compares by value; structure stamps are held to F2 (i) here only.
 */
const T = '2026-10-24T12:00:00.000Z';

afterEach(() => {
  setClock();
});

function draw(): DrawDefinition {
  return {
    drawId: 'd',
    structures: [
      {
        structureId: 's',
        matchUps: [{ matchUpId: 'm', matchUpStatus: TO_BE_PLAYED, drawPositions: [1, 2] }],
      },
    ],
  } as unknown as DrawDefinition;
}

describe('nextStamp, F2 (i)', () => {
  it('is the call instant over an older stamp or none, and one ms on from a stamp already as late', () => {
    expect(nextStamp(undefined, T)).toEqual(T);
    expect(nextStamp('2026-10-24T11:59:59.999Z', T)).toEqual(T);
    expect(nextStamp(T, T)).toEqual('2026-10-24T12:00:00.001Z');
    expect(nextStamp('2026-10-24T12:00:05.000Z', T)).toEqual('2026-10-24T12:00:05.001Z');
  });
});

describe('applyOutcomeOps', () => {
  it('writes the result as v1 stores it, and stamps each named entity once', () => {
    setClock(T);
    const drawDefinition = draw();
    const score = { scoreStringSide1: '3-2', scoreStringSide2: '2-3', sets: [{ setNumber: 1, side1Score: 3 }] };
    const result = applyOutcomeOps(drawDefinition, [
      { op: 'setMatchUpResult', matchUpId: 'm', matchUpStatus: IN_PROGRESS, score },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: 'm' },
      { op: 'stampUpdatedAt', entity: 'structure', id: 's' },
      { op: 'stampUpdatedAt', entity: 'drawDefinition', id: 'd' },
    ]);
    expect(result.error).toBeUndefined();
    const matchUp: any = (drawDefinition.structures as any)[0].matchUps[0];
    expect(matchUp).toMatchObject({ matchUpStatus: IN_PROGRESS, score, updatedAt: T, schedule: { scoredTime: T } });
    expect(matchUp.winningSide).toBeUndefined();
    expect((drawDefinition.structures as any)[0].updatedAt).toEqual(T);
    expect((drawDefinition as any).updatedAt).toEqual(T);
    // the op's score is copied, not shared: a later write to the plan cannot reach the record
    score.scoreStringSide1 = 'changed';
    expect(matchUp.score.scoreStringSide1).toEqual('3-2');
  });

  it('keeps a scoredTime once captured, and removes it with the score', () => {
    setClock(T);
    const drawDefinition = draw();
    const matchUp: any = (drawDefinition.structures as any)[0].matchUps[0];
    matchUp.schedule = { scoredTime: '2026-10-01T00:00:00.000Z' };
    const scored = { scoreStringSide1: '6-1', scoreStringSide2: '1-6', sets: [{ setNumber: 1, side1Score: 6 }] };
    applyOutcomeOps(drawDefinition, [
      { op: 'setMatchUpResult', matchUpId: 'm', matchUpStatus: COMPLETED, winningSide: 1, score: scored },
    ]);
    expect(matchUp.schedule.scoredTime).toEqual('2026-10-01T00:00:00.000Z');
    applyOutcomeOps(drawDefinition, [
      {
        op: 'setMatchUpResult',
        matchUpId: 'm',
        matchUpStatus: TO_BE_PLAYED,
        score: { scoreStringSide1: '', scoreStringSide2: '' },
        matchUpStatusCodes: [],
      },
    ]);
    expect(matchUp.schedule.scoredTime).toBeUndefined();
    expect(matchUp.winningSide).toBeUndefined();
    expect(matchUp.matchUpStatusCodes).toEqual([]);
  });

  it('refuses an op naming something the draw does not hold, so a shadow cannot pass by writing nothing', () => {
    const drawDefinition = draw();
    expect(
      applyOutcomeOps(drawDefinition, [{ op: 'setMatchUpResult', matchUpId: 'x', matchUpStatus: IN_PROGRESS }]).error,
    ).toContain('no matchUp x');
    expect(applyOutcomeOps(drawDefinition, [{ op: 'stampUpdatedAt', entity: 'structure', id: 'x' }]).error).toContain(
      'no structure x',
    );
    expect(
      applyOutcomeOps(drawDefinition, [{ op: 'stampUpdatedAt', entity: 'drawDefinition', id: 'x' }]).error,
    ).toContain('not this draw');
  });
});

describe('normaliseStamps (the shadow comparison, until v1 stamps only the structures a call touches)', () => {
  it('drops structure stamps, and keeps every other stamp for comparison by value', () => {
    const record: any = {
      updatedAt: T,
      events: [
        {
          updatedAt: T,
          drawDefinitions: [
            {
              updatedAt: T,
              structures: [
                {
                  updatedAt: T,
                  matchUps: [{ matchUpId: 'a', updatedAt: T }, { matchUpId: 'b' }],
                  structures: [{ updatedAt: T, matchUps: [{ matchUpId: 'c', updatedAt: T }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const normalised: any = normaliseStamps(record);
    const drawDefinition = normalised.events[0].drawDefinitions[0];
    expect(drawDefinition.updatedAt).toEqual(T);
    expect(drawDefinition.structures[0].updatedAt).toBeUndefined();
    expect(drawDefinition.structures[0].structures[0].updatedAt).toBeUndefined();
    expect(drawDefinition.structures[0].matchUps.map((m: any) => m.updatedAt)).toEqual([T, undefined]);
    expect(drawDefinition.structures[0].structures[0].matchUps[0].updatedAt).toEqual(T);
    expect(normalised.updatedAt).toEqual(T);
    expect(normalised.events[0].updatedAt).toEqual(T);
  });
});
