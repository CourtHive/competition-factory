import { expect, test, describe } from 'vitest';

import { confirmResult, disputeResult, submitResult } from '@Mutate/ladder/reportResult';
import { acceptChallenge, declineChallenge } from '@Mutate/ladder/respondToChallenge';
import { removeLadderParticipant } from '@Mutate/ladder/removeLadderParticipant';
import { applyLapseConsequence } from '@Mutate/ladder/applyLapseConsequence';
import { mirrorStandingToScale } from '@Mutate/ladder/mirrorStandingToScale';
import { addLadderParticipant } from '@Mutate/ladder/addLadderParticipant';
import { refreshLadderRatings } from '@Mutate/ladder/refreshLadderRatings';
import { applyLadderMovement } from '@Mutate/ladder/applyLadderMovement';
import { getChallengeState } from '@Query/ladder/getChallengeState';
import { issueChallenge } from '@Mutate/ladder/issueChallenge';

import { FORFEIT, FORFEIT_POSITION, RANK, RATING, RESULT, SWAP } from '@Constants/ladderConstants';
import { LADDER, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { CHALLENGED, COMPLETED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';
import { UTR } from '@Constants/ratingConstants';

const AT = '2026-04-01T00:00:00.000Z';

const ladder = (policy: any = { ordering: RANK, movement: SWAP }) => {
  const structure: any = {
    structureId: 's1',
    matchUps: [],
    positionAssignments: [
      { drawPosition: 1, participantId: 'p1' },
      { drawPosition: 2, participantId: 'p2' },
    ],
  };
  return {
    drawId: 'd1',
    drawType: LADDER,
    structures: [structure],
    extensions: [{ name: 'appliedPolicies', value: { [POLICY_TYPE_LADDER]: policy } }],
  } as any;
};

const notALadder = () => ({ ...ladder(), drawType: SINGLE_ELIMINATION });

// Guard clauses ARE the error contract of these mutations: every one of them is a way a caller can
// be wrong, and each should say which way rather than failing obscurely.
describe('every ladder mutation refuses a non-LADDER drawType', () => {
  const cases: [string, () => any][] = [
    [
      'issueChallenge',
      () =>
        issueChallenge({
          challengerParticipantId: 'p2',
          defenderParticipantId: 'p1',
          issuedAt: AT,
          drawDefinition: notALadder(),
        }),
    ],
    ['acceptChallenge', () => acceptChallenge({ drawDefinition: notALadder(), matchUpId: 'm', respondedAt: AT })],
    ['declineChallenge', () => declineChallenge({ drawDefinition: notALadder(), matchUpId: 'm', respondedAt: AT })],
    [
      'submitResult',
      () =>
        submitResult({
          drawDefinition: notALadder(),
          matchUpId: 'm',
          participantId: 'p1',
          submittedAt: AT,
          outcome: { winningSide: 1 },
        }),
    ],
    [
      'confirmResult',
      () => confirmResult({ drawDefinition: notALadder(), matchUpId: 'm', participantId: 'p1', confirmedAt: AT }),
    ],
    [
      'disputeResult',
      () => disputeResult({ drawDefinition: notALadder(), matchUpId: 'm', participantId: 'p1', disputedAt: AT }),
    ],
    [
      'removeLadderParticipant',
      () => removeLadderParticipant({ drawDefinition: notALadder(), participantId: 'p1', removedAt: AT }),
    ],
    [
      'addLadderParticipant',
      () => addLadderParticipant({ drawDefinition: notALadder(), participantId: 'x', addedAt: AT }),
    ],
    [
      'applyLadderMovement',
      () => applyLadderMovement({ drawDefinition: notALadder(), structure: {}, appliedAt: AT, trigger: FORFEIT }),
    ],
    [
      'refreshLadderRatings',
      () => refreshLadderRatings({ drawDefinition: notALadder(), tournamentRecord: {}, ratings: {}, refreshedAt: AT }),
    ],
  ];
  test.each(cases)('%s', (_name, call) => {
    expect((call() as any).error).toBeDefined();
  });
});

describe('a missing drawDefinition is named, not inferred', () => {
  const cases: [string, () => any][] = [
    [
      'issueChallenge',
      () => issueChallenge({ challengerParticipantId: 'a', defenderParticipantId: 'b', issuedAt: AT } as any),
    ],
    ['acceptChallenge', () => acceptChallenge({ matchUpId: 'm', respondedAt: AT } as any)],
    [
      'submitResult',
      () => submitResult({ matchUpId: 'm', participantId: 'p', submittedAt: AT, outcome: { winningSide: 1 } } as any),
    ],
    ['removeLadderParticipant', () => removeLadderParticipant({ participantId: 'p', removedAt: AT } as any)],
    ['addLadderParticipant', () => addLadderParticipant({ participantId: 'p', addedAt: AT } as any)],
    ['applyLadderMovement', () => applyLadderMovement({ structure: {}, appliedAt: AT, trigger: FORFEIT } as any)],
    ['refreshLadderRatings', () => refreshLadderRatings({ tournamentRecord: {}, ratings: {}, refreshedAt: AT } as any)],
  ];
  test.each(cases)('%s', (_name, call) => {
    expect((call() as any).error).toBeDefined();
  });
});

describe('required instants and identifiers', () => {
  test('issueChallenge requires issuedAt', () => {
    expect(
      issueChallenge({ challengerParticipantId: 'p2', defenderParticipantId: 'p1', drawDefinition: ladder() } as any)
        .error,
    ).toBeDefined();
  });
  test('acceptChallenge requires respondedAt', () => {
    expect((acceptChallenge({ drawDefinition: ladder(), matchUpId: 'm' } as any) as any).error).toBeDefined();
  });
  test('submitResult requires a winningSide', () => {
    expect(
      (
        submitResult({
          drawDefinition: ladder(),
          matchUpId: 'm',
          participantId: 'p1',
          submittedAt: AT,
          outcome: {},
        } as any) as any
      ).error,
    ).toBeDefined();
  });
  test('confirmResult requires a participantId or an operator', () => {
    expect(
      (confirmResult({ drawDefinition: ladder(), matchUpId: 'm', confirmedAt: AT } as any) as any).error,
    ).toBeDefined();
  });
  test('removeLadderParticipant requires removedAt', () => {
    expect(
      (removeLadderParticipant({ drawDefinition: ladder(), participantId: 'p1' } as any) as any).error,
    ).toBeDefined();
  });
  test('addLadderParticipant requires addedAt', () => {
    expect((addLadderParticipant({ drawDefinition: ladder(), participantId: 'x' } as any) as any).error).toBeDefined();
  });
  test('applyLapseConsequence requires appliedAt and participantId', () => {
    expect(
      (applyLapseConsequence({ drawDefinition: ladder(), structure: {}, participantId: 'p' } as any) as any).error,
    ).toBeDefined();
  });
  test('refreshLadderRatings requires a ratings map, a record, and refreshedAt', () => {
    const drawDefinition = ladder({ ordering: RATING, ratingType: UTR });
    expect(
      (refreshLadderRatings({ drawDefinition, tournamentRecord: {}, refreshedAt: AT } as any) as any).error,
    ).toBeDefined();
    expect(
      (refreshLadderRatings({ drawDefinition, tournamentRecord: {}, ratings: {} } as any) as any).error,
    ).toBeDefined();
    expect((refreshLadderRatings({ drawDefinition, ratings: {}, refreshedAt: AT } as any) as any).error).toBeDefined();
  });
});

describe('resolution failures', () => {
  test('a matchUp that does not exist is NOT_FOUND, not a crash', () => {
    expect(
      (acceptChallenge({ drawDefinition: ladder(), matchUpId: 'nope', respondedAt: AT }) as any).error,
    ).toBeDefined();
    expect(
      (
        submitResult({
          drawDefinition: ladder(),
          matchUpId: 'nope',
          participantId: 'p1',
          submittedAt: AT,
          outcome: { winningSide: 1 },
        }) as any
      ).error,
    ).toBeDefined();
  });

  test('a structure that does not exist is named', () => {
    const drawDefinition = ladder();
    expect(
      (removeLadderParticipant({ drawDefinition, participantId: 'p1', structureId: 'nope', removedAt: AT }) as any)
        .error,
    ).toBeDefined();
    expect(
      (addLadderParticipant({ drawDefinition, participantId: 'x', structureId: 'nope', addedAt: AT }) as any).error,
    ).toBeDefined();
  });

  test('applyLadderMovement with a RESULT trigger and an unknown matchUpId', () => {
    const drawDefinition = ladder();
    const result: any = applyLadderMovement({
      trigger: RESULT,
      matchUpId: 'nope',
      structure: drawDefinition.structures[0],
      drawDefinition,
      appliedAt: AT,
    });
    expect(result.error).toBeDefined();
  });

  test('a FORFEIT movement naming a participant who is not seated', () => {
    const drawDefinition = ladder();
    const result: any = applyLadderMovement({
      challengerParticipantId: 'ghost',
      defenderParticipantId: 'p1',
      trigger: FORFEIT,
      structure: drawDefinition.structures[0],
      drawDefinition,
      appliedAt: AT,
    });
    expect(result.error).toBeDefined();
  });

  test('FORFEIT_POSITION with nobody to take the position is refused', () => {
    // Silently skipping would make the policy look enforced when it was not.
    const drawDefinition = ladder({
      ordering: RANK,
      movement: SWAP,
      lapsePolicy: { allowance: 0, consequence: FORFEIT_POSITION },
    });
    const structure = drawDefinition.structures[0];
    structure.matchUps.push({
      matchUpId: 'm1',
      matchUpStatus: CHALLENGED,
      sides: [
        { sideNumber: 1, participantId: 'p2' },
        { sideNumber: 2, participantId: 'p1' },
      ],
      timeItems: [
        { itemType: 'ladder.challenge.issued', itemValue: 'p2', itemDate: AT },
        { itemType: 'ladder.challenge.declined', itemValue: true, itemDate: AT },
      ],
    });
    const result: any = applyLapseConsequence({ participantId: 'p1', appliedAt: AT, structure, drawDefinition });
    expect(result.error).toBeDefined();
    expect(result.info).toMatch(/challenger/);
  });
});

describe('degenerate but legal inputs', () => {
  test('mirrorStandingToScale with no tournamentRecord writes nothing and does not fail', () => {
    expect(
      mirrorStandingToScale({
        drawDefinition: ladder(),
        appliedAt: AT,
        touched: [{ drawPosition: 1, participantId: 'p1' }],
      }),
    ).toEqual({ written: 0 });
  });

  test('mirrorStandingToScale skips an assignment with no participant', () => {
    const tournamentRecord: any = { tournamentId: 't', participants: [] };
    expect(
      mirrorStandingToScale({
        tournamentRecord,
        drawDefinition: ladder(),
        appliedAt: AT,
        touched: [{ drawPosition: 3, bye: true }],
      }),
    ).toEqual({ written: 0 });
  });

  test('getChallengeState with no issue record is PENDING, not EXPIRED', () => {
    // Something that never started cannot have run out.
    expect(getChallengeState({ matchUp: { timeItems: [] }, policy: { acceptanceDays: 5 }, asOf: AT }).state).toEqual(
      'PENDING',
    );
  });

  test('getChallengeState with no acceptanceDays never expires', () => {
    const matchUp = {
      timeItems: [{ itemType: 'ladder.challenge.issued', itemValue: 'x', itemDate: '2020-01-01T00:00:00.000Z' }],
    };
    expect(getChallengeState({ matchUp, policy: {}, asOf: AT }).state).toEqual('PENDING');
  });

  test('a completed matchUp cannot be accepted or declined again', () => {
    const drawDefinition = ladder();
    drawDefinition.structures[0].matchUps.push({ matchUpId: 'm1', matchUpStatus: COMPLETED, sides: [], timeItems: [] });
    expect((acceptChallenge({ drawDefinition, matchUpId: 'm1', respondedAt: AT }) as any).error).toBeDefined();
    expect((declineChallenge({ drawDefinition, matchUpId: 'm1', respondedAt: AT }) as any).error).toBeDefined();
  });
});
