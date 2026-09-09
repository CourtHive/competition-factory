import { expect, test, describe } from 'vitest';

import { removeLadderParticipant } from '@Mutate/ladder/removeLadderParticipant';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';

import { INSERTION, RANK, RATING, SWAP } from '@Constants/ladderConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';

const AT = '2026-03-10T09:00:00.000Z';

// Positions 1..5, one participant each. A ladder position is a RANK: 1 is the top.
const ladder = (policy?: any) => {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: [1, 2, 3, 4, 5].map((drawPosition) => ({ drawPosition, participantId: `p${drawPosition}` })),
  };
  const drawDefinition: any = { drawId: 'd1', drawType: LADDER, structures: [structure] };
  if (policy) drawDefinition.extensions = [{ name: 'appliedPolicies', value: { [POLICY_TYPE_LADDER]: policy } }];
  return { drawDefinition, structure };
};

const standing = (structure: any) =>
  [...structure.positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);

describe('SWAP — the two exchange positions and nobody else moves', () => {
  test('p4 beating p2 exchanges only those two', () => {
    const { drawDefinition, structure } = ladder({ ordering: RANK, movement: SWAP });
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      challengerPrevails: true,
      drawDefinition,
      structure,
      appliedAt: AT,
    });

    expect(result.moved).toEqual(true);
    expect(standing(structure)).toEqual(['p1', 'p4', 'p3', 'p2', 'p5']);
  });
});

describe('INSERTION — the winner takes the position and a whole run shifts down', () => {
  test('p4 beating p2 pushes p2 and p3 down one each', () => {
    // This is what makes INSERTION a materially different competition from SWAP.
    const { drawDefinition, structure } = ladder({ ordering: RANK, movement: INSERTION });
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      challengerPrevails: true,
      drawDefinition,
      structure,
      appliedAt: AT,
    });

    expect(result.moved).toEqual(true);
    expect(standing(structure)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
  });
});

describe('when nothing should move', () => {
  test('the defender holding on moves nobody', () => {
    const { drawDefinition, structure } = ladder();
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      challengerPrevails: false,
      drawDefinition,
      structure,
      appliedAt: AT,
    });
    expect(result.moved).toEqual(false);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('a RATING ladder has no movement machinery, and says so rather than failing', () => {
    // The early return the ordering seam exists for: positionAssignments is a projection there.
    const { drawDefinition, structure } = ladder({ ordering: RATING, movement: SWAP });
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      challengerPrevails: true,
      drawDefinition,
      structure,
      appliedAt: AT,
    });

    expect(result.error).toBeUndefined();
    expect(result.moved).toEqual(false);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('an upward-facing challenge is refused — the ranks must be the right way round', () => {
    const { drawDefinition, structure } = ladder();
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p2', // already above p4
      defenderParticipantId: 'p4',
      challengerPrevails: true,
      drawDefinition,
      structure,
      appliedAt: AT,
    });
    expect(result.error).toBeDefined();
  });
});

describe('manual removal — the escape hatch policy deliberately does not provide', () => {
  test('removing a participant closes the ladder up beneath them', () => {
    // Nobody lapses if nobody challenges them, so an operator must be able to act for the member
    // who has left the club, is injured for the season, or has died.
    const { drawDefinition, structure } = ladder();
    const result: any = removeLadderParticipant({
      participantId: 'p2',
      reason: 'left the club',
      removedAt: AT,
      drawDefinition,
    });

    expect(result.error).toBeUndefined();
    expect(result.vacatedPosition).toEqual(2);
    // A ladder with a hole in it is not a ranking.
    expect(standing(structure)).toEqual(['p1', 'p3', 'p4', 'p5']);
    expect(structure.positionAssignments.map((a: any) => a.drawPosition)).toEqual([1, 2, 3, 4]);
  });

  test('the removal is recorded with its reason', () => {
    // A manual override with no reason is indistinguishable from a mistake.
    const { drawDefinition, structure } = ladder();
    removeLadderParticipant({ participantId: 'p3', reason: 'injured', removedAt: AT, drawDefinition });
    const timeItem = structure.timeItems.at(-1);
    expect(timeItem.itemValue).toEqual({ participantId: 'p3', reason: 'injured' });
    expect(timeItem.itemDate).toEqual(AT);
  });

  test('removing someone not on the ladder is an error, not a silent no-op', () => {
    const { drawDefinition } = ladder();
    const result: any = removeLadderParticipant({ participantId: 'ghost', removedAt: AT, drawDefinition });
    expect(result.error).toBeDefined();
  });
});
