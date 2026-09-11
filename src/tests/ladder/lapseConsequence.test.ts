import { expect, test, describe } from 'vitest';

import { declineChallenge } from '@Mutate/ladder/respondToChallenge';
import { issueChallenge } from '@Mutate/ladder/issueChallenge';

import { DROP, FORFEIT_POSITION, RANK, REMOVE, SWAP } from '@Constants/ladderConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';

const AT = (d: string) => `2026-03-${d}T10:00:00.000Z`;

const ladder = (lapsePolicy: any) => {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: [1, 2, 3, 4, 5].map((drawPosition) => ({ drawPosition, participantId: `p${drawPosition}` })),
  };
  return {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [
      {
        name: 'appliedPolicies',
        value: { [POLICY_TYPE_LADDER]: { ordering: RANK, movement: SWAP, acceptanceDays: 5, lapsePolicy } },
      },
    ],
  } as any;
};

const standing = (drawDefinition: any) =>
  [...drawDefinition.structures[0].positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);

/** p3 challenges p1, p1 declines. */
const declineOnce = (drawDefinition: any, day: string, challenger = 'p3') => {
  const { matchUpId }: any = issueChallenge({
    challengerParticipantId: challenger,
    defenderParticipantId: 'p1',
    issuedAt: AT(day),
    drawDefinition,
  });
  return declineChallenge({ drawDefinition, matchUpId, respondedAt: AT(day) }) as any;
};

describe('FORFEIT_POSITION', () => {
  test('the challenger of THIS challenge takes the forfeited position', () => {
    // A forfeited position is not vacated, it is taken — and only the challenge in front of us
    // knows who takes it. That is why the consequence is applied at decline time.
    const drawDefinition = ladder({ allowance: 0, consequence: FORFEIT_POSITION });
    const result = declineOnce(drawDefinition, '02');

    expect(result.error).toBeUndefined();
    expect(result.applied).toEqual(true);
    expect(result.consequence).toEqual(FORFEIT_POSITION);
    expect(standing(drawDefinition)).toEqual(['p3', 'p2', 'p1', 'p4', 'p5']);
  });

  test('an allowance is respected — the FIRST decline is free', () => {
    const drawDefinition = ladder({ allowance: 1, consequence: FORFEIT_POSITION });

    const first = declineOnce(drawDefinition, '02');
    expect(first.applied).toEqual(false);
    expect(standing(drawDefinition)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);

    const second = declineOnce(drawDefinition, '03', 'p2');
    expect(second.applied).toEqual(true);
    expect(standing(drawDefinition)).toEqual(['p2', 'p1', 'p3', 'p4', 'p5']);
  });

  test('the decline is counted BEFORE the lapse is evaluated', () => {
    // Evaluating first would always be one behind, giving every defender a permanent free decline.
    const drawDefinition = ladder({ allowance: 0, consequence: FORFEIT_POSITION });
    expect(declineOnce(drawDefinition, '02').lapseCount).toEqual(1);
  });
});

describe('DROP', () => {
  test('the participant moves down and everyone passed moves up — nobody takes their place', () => {
    const drawDefinition = ladder({ allowance: 0, consequence: DROP, dropPositions: 2 });
    const result = declineOnce(drawDefinition, '02');

    expect(result.consequence).toEqual(DROP);
    // p1 drops two; p2 and p3 each move up one. Distinct from a challenge movement.
    expect(standing(drawDefinition)).toEqual(['p2', 'p3', 'p1', 'p4', 'p5']);
  });

  test('dropping past the bottom lands ON the bottom rather than erroring', () => {
    // "drop 20" on a 5-person ladder is clumsy configuration, not a failure state.
    const drawDefinition = ladder({ allowance: 0, consequence: DROP, dropPositions: 20 });
    const result = declineOnce(drawDefinition, '02');
    expect(result.error).toBeUndefined();
    expect(standing(drawDefinition)).toEqual(['p2', 'p3', 'p4', 'p5', 'p1']);
  });
});

describe('REMOVE', () => {
  test('the participant leaves the ladder and it closes up beneath them', () => {
    const drawDefinition = ladder({ allowance: 0, consequence: REMOVE });
    const result = declineOnce(drawDefinition, '02');

    expect(result.consequence).toEqual(REMOVE);
    expect(standing(drawDefinition)).toEqual(['p2', 'p3', 'p4', 'p5']);
    const timeItem = drawDefinition.structures[0].timeItems.at(-1);
    expect(timeItem.itemValue.reason).toMatch(/lapse allowance exceeded/);
  });
});

describe('no consequence configured', () => {
  test('the decline is recorded and counted, and nothing happens', () => {
    const drawDefinition = ladder({ allowance: 0 });
    const result = declineOnce(drawDefinition, '02');
    expect(result.applied).toEqual(false);
    expect(result.lapseCount).toEqual(1);
    expect(standing(drawDefinition)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});
