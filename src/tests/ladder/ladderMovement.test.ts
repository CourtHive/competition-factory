import { expect, test, describe } from 'vitest';

import { removeLadderParticipant } from '@Mutate/ladder/removeLadderParticipant';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';

import {
  FORFEIT,
  INSERTION,
  OPERATOR,
  RANK,
  RATING,
  RESULT,
  RESULT_CONFIRMED,
  RESULT_DISPUTED,
  RESULT_SUBMITTED,
  SWAP,
} from '@Constants/ladderConstants';
import { CHALLENGED, COMPLETED } from '@Constants/matchUpStatusConstants';
import { RESULT_NOT_VALIDATED } from '@Constants/errorConditionConstants';
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

/**
 * A completed matchUp between a challenger (side 1) and a defender (side 2).
 * `attested` controls whether it carries a confirmed result — the gate under test.
 */
const playedMatchUp = ({ structure, challenger, defender, winningSide = 1, attested = true, confirmedBy }: any) => {
  const timeItems: any[] = [
    { itemType: RESULT_SUBMITTED, itemValue: { participantId: challenger }, itemDate: '2026-03-09T10:00:00.000Z' },
  ];
  if (attested) {
    timeItems.push({
      itemType: RESULT_CONFIRMED,
      itemValue: { participantId: confirmedBy ?? defender },
      itemDate: '2026-03-09T12:00:00.000Z',
    });
  }
  const matchUp = {
    matchUpId: 'm1',
    matchUpStatus: COMPLETED,
    winningSide,
    sides: [
      { sideNumber: 1, participantId: challenger },
      { sideNumber: 2, participantId: defender },
    ],
    timeItems,
  };
  structure.matchUps.push(matchUp);
  return matchUp;
};

const moveOnResult = (params: any) =>
  applyLadderMovement({ ...params, trigger: RESULT, matchUpId: 'm1', appliedAt: AT });

const standing = (structure: any) =>
  [...structure.positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);

describe('SWAP — the two exchange positions and nobody else moves', () => {
  test('p4 beating p2 exchanges only those two', () => {
    const { drawDefinition, structure } = ladder({ ordering: RANK, movement: SWAP });
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2' });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toBeUndefined();
    expect(result.moved).toEqual(true);
    expect(standing(structure)).toEqual(['p1', 'p4', 'p3', 'p2', 'p5']);
  });
});

describe('INSERTION — the winner takes the position and a whole run shifts down', () => {
  test('p4 beating p2 pushes p2 and p3 down one each', () => {
    // This is what makes INSERTION a materially different competition from SWAP.
    const { drawDefinition, structure } = ladder({ ordering: RANK, movement: INSERTION });
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2' });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toBeUndefined();
    expect(result.moved).toEqual(true);
    expect(standing(structure)).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
  });
});

describe('when nothing should move', () => {
  test('the defender holding on moves nobody', () => {
    const { drawDefinition, structure } = ladder();
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2', winningSide: 2 });
    const result: any = moveOnResult({ drawDefinition, structure });
    expect(result.moved).toEqual(false);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('a RATING ladder has no movement machinery, and says so rather than failing', () => {
    // The early return the ordering seam exists for: positionAssignments is a projection there.
    const { drawDefinition, structure } = ladder({ ordering: RATING, movement: SWAP });
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2' });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toBeUndefined();
    expect(result.moved).toEqual(false);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('an upward-facing challenge is refused — the ranks must be the right way round', () => {
    const { drawDefinition, structure } = ladder();
    playedMatchUp({ structure, challenger: 'p2', defender: 'p4' }); // p2 is already above p4
    const result: any = moveOnResult({ drawDefinition, structure });
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

describe('the attestation GATE — a provisional score must not move a standing', () => {
  test('an UNCONFIRMED score is refused, and the ladder is untouched', () => {
    // The exposure this closes: on a published ladder members report their own results, so a
    // self-reported win nobody contradicted would otherwise reorder the ladder unilaterally.
    const { drawDefinition, structure } = ladder();
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2', attested: false });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toEqual(RESULT_NOT_VALIDATED);
    expect(result.info).toMatch(/unconfirmed/);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('a participant cannot confirm their OWN score, under any policy', () => {
    // Without this, "confirmation" is satisfied by submitting twice.
    const { drawDefinition, structure } = ladder();
    playedMatchUp({ structure, challenger: 'p4', defender: 'p2', confirmedBy: 'p4' });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toEqual(RESULT_NOT_VALIDATED);
    expect(result.info).toMatch(/own score/);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('peer confirmation is enough by default; OPERATOR policy demands more', () => {
    // Peer acceptance and operator validation are the same transition with a different attestor —
    // the policy decides which attestors count.
    const peer = ladder({ ordering: RANK, movement: SWAP });
    playedMatchUp({ structure: peer.structure, challenger: 'p4', defender: 'p2' });
    expect(moveOnResult(peer).moved).toEqual(true);

    const strict = ladder({ ordering: RANK, movement: SWAP, resultValidation: OPERATOR });
    playedMatchUp({ structure: strict.structure, challenger: 'p4', defender: 'p2' });
    const result: any = moveOnResult(strict);
    expect(result.error).toEqual(RESULT_NOT_VALIDATED);
    expect(result.info).toMatch(/operator/i);
  });

  test('an operator confirmation satisfies an OPERATOR policy', () => {
    const strict = ladder({ ordering: RANK, movement: SWAP, resultValidation: OPERATOR });
    const matchUp = playedMatchUp({ structure: strict.structure, challenger: 'p4', defender: 'p2', attested: false });
    matchUp.timeItems.push({
      itemType: RESULT_CONFIRMED,
      itemValue: { operator: true, participantId: 'director' },
      itemDate: '2026-03-09T13:00:00.000Z',
    });
    expect(moveOnResult(strict).moved).toEqual(true);
  });

  test('a DISPUTE blocks the move even after a confirmation', () => {
    // Neither validated nor rejected — D9. What matters here is that it does not move the ladder.
    const { drawDefinition, structure } = ladder();
    const matchUp = playedMatchUp({ structure, challenger: 'p4', defender: 'p2' });
    matchUp.timeItems.push({
      itemType: RESULT_DISPUTED,
      itemValue: { participantId: 'p2' },
      itemDate: '2026-03-09T14:00:00.000Z',
    });
    const result: any = moveOnResult({ drawDefinition, structure });

    expect(result.error).toEqual(RESULT_NOT_VALIDATED);
    expect(result.info).toMatch(/disputed/);
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  test('an incomplete matchUp cannot move a standing however it is attested', () => {
    const { drawDefinition, structure } = ladder();
    const matchUp = playedMatchUp({ structure, challenger: 'p4', defender: 'p2' });
    matchUp.matchUpStatus = CHALLENGED;
    const result: any = moveOnResult({ drawDefinition, structure });
    expect(result.error).toBeDefined();
    expect(standing(structure)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});

describe('FORFEIT — the one trigger with no score to attest', () => {
  test('a declined challenge moves the standing without a matchUp', () => {
    const { drawDefinition, structure } = ladder({ ordering: RANK, movement: SWAP });
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      trigger: FORFEIT,
      drawDefinition,
      structure,
      appliedAt: AT,
    });

    expect(result.error).toBeUndefined();
    expect(standing(structure)).toEqual(['p1', 'p4', 'p3', 'p2', 'p5']);
  });

  test('a RESULT trigger without a matchUpId is refused rather than treated as a forfeit', () => {
    // The two triggers must not be able to stand in for one another.
    const { drawDefinition, structure } = ladder();
    const result: any = applyLadderMovement({
      challengerParticipantId: 'p4',
      defenderParticipantId: 'p2',
      trigger: RESULT,
      drawDefinition,
      structure,
      appliedAt: AT,
    });
    expect(result.error).toBeDefined();
  });

  test('an unknown trigger is refused', () => {
    const { drawDefinition, structure } = ladder();
    const result: any = applyLadderMovement({ drawDefinition, structure, appliedAt: AT, trigger: 'WISHFUL' } as any);
    expect(result.error).toBeDefined();
  });
});
