import { operatorDrawPresentation, operatorMatchPresentation } from '@Query/readModel/operatorPresentation';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { getMatchUpUpset } from '@Query/matchUp/getMatchUpUpset';
import { describe, expect, it } from 'vitest';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';

function match(overrides: Partial<HydratedMatchUp> = {}): HydratedMatchUp {
  return {
    tournamentId: 't',
    eventId: 'e',
    drawId: 'd',
    structureId: 's',
    matchUpId: 'm',
    roundNumber: 1,
    roundPosition: 1,
    matchUpStatus: 'COMPLETED',
    matchUpType: 'SINGLES',
    matchUpFormat: 'SET3-S:6/TB7',
    winningSide: 1,
    score: {
      sets: [
        { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
      ],
    },
    sides: [
      {
        sideNumber: 1,
        participantId: 'p1',
        participant: {
          participantId: 'p1',
          participantName: 'A',
          person: { personId: 'person-a', contacts: [{ emailAddress: 'private@example.test' }] },
        },
      },
      { sideNumber: 2, participantId: 'p2', seedValue: 1, participant: { participantId: 'p2', participantName: 'B' } },
    ],
    ...overrides,
  };
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

describe('operator presentation — canonical factory decisions, explicit display fields', () => {
  it('does not mutate a deeply frozen input, including an unsorted score array', () => {
    const input = match();
    freeze(input);
    const view = operatorMatchPresentation(input);
    expect(view.scoreText).toBe('6-4 6-3');
    expect(input.score?.sets?.map((set) => set.setNumber)).toEqual([2, 1]);
    expect(view.hasScore).toBe(checkScoreHasValue({ matchUp: input }));
    expect(view.isUpset).toBe(getMatchUpUpset({ matchUp: input }).isUpset);
    expect(view.isUpset).toBe(true);
    expect(view.sides.map((side) => side.isWinner)).toEqual([true, false]);
    expect(JSON.stringify(view)).not.toContain('private@example.test');
    expect(JSON.stringify(view)).not.toContain('person-a');
    expect(view).not.toHaveProperty('validActions');
  });

  it.each(['RETIRED', 'WALKOVER', 'TO_BE_PLAYED'] as const)('does not invent upset/score presence for %s', (status) => {
    const input = match({ matchUpStatus: status, score: { sets: [] } });
    const view = operatorMatchPresentation(input);
    expect(view.hasScore).toBe(checkScoreHasValue({ matchUp: input }));
    expect(view.isUpset).toBe(getMatchUpUpset({ matchUp: input }).isUpset);
  });

  it('preserves BYE/qualifier identities and empty sides without substituting participant names', () => {
    const view = operatorMatchPresentation(
      match({ winningSide: undefined, sides: [{ sideNumber: 2, qualifier: true }] }),
    );
    expect(view.sides[0].name).toBeUndefined();
    expect(view.sides[0].isWinner).toBe(false);
    expect(view.sides[1].qualifier).toBe(true);
    expect(operatorMatchPresentation(match({ sides: [{ sideNumber: 1, bye: true }] })).sides[0].bye).toBe(true);
  });

  it('uses factory round and match order, not the input array order', () => {
    const input = [
      match({ matchUpId: 'final', roundNumber: 2, roundPosition: 1 }),
      match({ matchUpId: 'second', roundPosition: 2 }),
      match({ matchUpId: 'first', roundPosition: 1 }),
    ];
    freeze(input);
    let result: any = operatorDrawPresentation({ drawId: 'd', structureId: 's', matchUps: input });
    expect(result.error).toBeUndefined();
    expect(result.presentation.rounds.map((round) => round.roundNumber)).toEqual([1, 2]);
    expect(result.presentation.rounds[0].matches.map((item) => item.matchUpId)).toEqual(['first', 'second']);
    expect(input.map((item) => item.matchUpId)).toEqual(['final', 'second', 'first']);
  });

  it('honors canonical TEAM-level filtering instead of displaying its rubbers twice', () => {
    let result: any = operatorDrawPresentation({
      drawId: 'd',
      structureId: 's',
      matchUps: [
        match({ matchUpId: 'dual', matchUpType: 'TEAM' }),
        match({ matchUpId: 'rubber', matchUpType: 'SINGLES' }),
      ],
    });
    expect(result.presentation.rounds[0].matches.map((item) => item.matchUpId)).toEqual(['dual']);
  });

  it.each([undefined, 0, -1, 1.5])(
    'refuses an unrepresentable round %s rather than dropping its match',
    (roundNumber) => {
      let result: any = operatorDrawPresentation({ drawId: 'd', structureId: 's', matchUps: [match({ roundNumber })] });
      expect(result.error).toBe(INVALID_VALUES);
      expect(result.presentation).toBeUndefined();
    },
  );

  it('returns an explicit empty structure and refuses mixed contexts or duplicate identities', () => {
    let result: any = operatorDrawPresentation({ drawId: 'd', structureId: 's', matchUps: [] });
    expect(result.presentation.rounds).toEqual([]);
    for (const matchUps of [[match(), match()], [match({ structureId: 'other' })], [match({ drawId: 'other' })]]) {
      result = operatorDrawPresentation({ drawId: 'd', structureId: 's', matchUps });
      expect(result.error).toBe(INVALID_VALUES);
      expect(result.presentation).toBeUndefined();
    }
  });
});
