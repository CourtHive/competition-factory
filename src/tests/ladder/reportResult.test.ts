import { expect, test, describe } from 'vitest';

import { confirmResult, disputeResult, submitResult } from '@Mutate/ladder/reportResult';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';

import { AWAITING_RESULT, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { OPERATOR, RANK, RESULT, SWAP } from '@Constants/ladderConstants';
import { RESULT_NOT_VALIDATED } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { LADDER } from '@Constants/drawDefinitionConstants';

const T = (h: number) => `2026-03-1${h}T10:00:00.000Z`;

const ladder = (policy: any = { ordering: RANK, movement: SWAP }) => {
  const matchUp: any = {
    matchUpId: 'm1',
    matchUpStatus: TO_BE_PLAYED,
    sides: [
      { sideNumber: 1, participantId: 'challenger' },
      { sideNumber: 2, participantId: 'defender' },
    ],
    timeItems: [],
  };
  const structure: any = {
    structureId: 's1',
    matchUps: [matchUp],
    positionAssignments: [
      { drawPosition: 1, participantId: 'defender' },
      { drawPosition: 2, participantId: 'challenger' },
    ],
  };
  const drawDefinition: any = {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [{ name: 'appliedPolicies', value: { [POLICY_TYPE_LADDER]: policy } }],
  };
  return { drawDefinition, structure, matchUp };
};

const standing = (structure: any) =>
  [...structure.positionAssignments]
    .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
    .map((a: any) => a.participantId);

describe('submitting a result', () => {
  test('records the score but leaves it AWAITING_RESULT, not COMPLETED', () => {
    // A reported score is not an agreed one — that distinction is the whole mechanism.
    const { drawDefinition, matchUp } = ladder();
    const result = submitResult({
      outcome: { winningSide: 1, score: { scoreStringSide1: '6-4 6-3' } },
      participantId: 'challenger',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });

    expect(result.error).toBeUndefined();
    expect(matchUp.matchUpStatus).toEqual(AWAITING_RESULT);
    expect(matchUp.winningSide).toEqual(1);
    expect(matchUp.score.scoreStringSide1).toEqual('6-4 6-3');
  });

  test('only someone who played it may report it', () => {
    const { drawDefinition } = ladder();
    const result: any = submitResult({
      outcome: { winningSide: 1 },
      participantId: 'bystander',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });
    expect(result.error).toBeDefined();
    expect(result.info).toMatch(/only a participant/);
  });
});

describe('confirming makes it a result', () => {
  test('the opponent confirming completes the matchUp and unlocks movement', () => {
    const { drawDefinition, structure, matchUp } = ladder();
    submitResult({
      outcome: { winningSide: 1 },
      participantId: 'challenger',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });

    // Before confirmation the gate holds.
    const early: any = applyLadderMovement({
      trigger: RESULT,
      matchUpId: 'm1',
      drawDefinition,
      structure,
      appliedAt: T(2),
    });
    expect(early.error).toEqual(RESULT_NOT_VALIDATED);
    expect(standing(structure)).toEqual(['defender', 'challenger']);

    confirmResult({ participantId: 'defender', confirmedAt: T(2), drawDefinition, matchUpId: 'm1' });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);

    const moved: any = applyLadderMovement({
      trigger: RESULT,
      matchUpId: 'm1',
      drawDefinition,
      structure,
      appliedAt: T(3),
    });
    expect(moved.moved).toEqual(true);
    expect(standing(structure)).toEqual(['challenger', 'defender']);
  });

  test('the submitter confirming their own score does NOT complete it', () => {
    // Otherwise 'confirmation' is satisfied by pressing the button twice.
    const { drawDefinition, matchUp } = ladder();
    submitResult({
      outcome: { winningSide: 1 },
      participantId: 'challenger',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });
    const result: any = confirmResult({
      participantId: 'challenger',
      confirmedAt: T(2),
      drawDefinition,
      matchUpId: 'm1',
    });

    expect(matchUp.matchUpStatus).toEqual(AWAITING_RESULT);
    expect(result.info).toMatch(/own score/);
  });

  test('under an OPERATOR policy a peer confirmation is recorded but does not complete', () => {
    const { drawDefinition, matchUp } = ladder({ ordering: RANK, movement: SWAP, resultValidation: OPERATOR });
    submitResult({
      outcome: { winningSide: 1 },
      participantId: 'challenger',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });

    const peer: any = confirmResult({ participantId: 'defender', confirmedAt: T(2), drawDefinition, matchUpId: 'm1' });
    expect(matchUp.matchUpStatus).toEqual(AWAITING_RESULT);
    expect(peer.info).toMatch(/operator/i);

    confirmResult({ operator: true, confirmedAt: T(3), drawDefinition, matchUpId: 'm1' });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });
});

describe('disputing', () => {
  test('a dispute after confirmation returns the matchUp to AWAITING_RESULT and blocks movement', () => {
    // A disputed result is not a result.
    const { drawDefinition, structure, matchUp } = ladder();
    submitResult({
      outcome: { winningSide: 1 },
      participantId: 'challenger',
      submittedAt: T(1),
      drawDefinition,
      matchUpId: 'm1',
    });
    confirmResult({ participantId: 'defender', confirmedAt: T(2), drawDefinition, matchUpId: 'm1' });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);

    disputeResult({
      participantId: 'defender',
      disputedAt: T(3),
      reason: 'wrong score',
      drawDefinition,
      matchUpId: 'm1',
    });
    expect(matchUp.matchUpStatus).toEqual(AWAITING_RESULT);

    const blocked: any = applyLadderMovement({
      trigger: RESULT,
      matchUpId: 'm1',
      drawDefinition,
      structure,
      appliedAt: T(4),
    });
    expect(blocked.error).toEqual(RESULT_NOT_VALIDATED);
    expect(standing(structure)).toEqual(['defender', 'challenger']);
  });

  test('there is nothing to dispute before a score is reported', () => {
    const { drawDefinition } = ladder();
    const result: any = disputeResult({ participantId: 'defender', disputedAt: T(1), drawDefinition, matchUpId: 'm1' });
    expect(result.error).toBeDefined();
  });
});
