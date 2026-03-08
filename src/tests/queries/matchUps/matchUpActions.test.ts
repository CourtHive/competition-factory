import { matchUpActions } from '@Query/drawDefinition/matchUpActions/matchUpActions';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { PENALTY, REFEREE, SCHEDULE, SCORE, STATUS } from '@Constants/matchUpActionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

test('matchUpActions returns expected error messages', () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let result = matchUpActions();
  expect(result.error).toEqual(INVALID_VALUES);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = matchUpActions({
    matchUpId: 'matchUpId',
    eventId: 'eventId',
    drawId: 'drawId',
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = matchUpActions({
    tournamentId: 'tournamentId',
    tournamentRecords: {},
    matchUpId: 'matchUpId',
    eventId: 'eventId',
    drawId: 'drawId',
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  result = matchUpActions({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    tournamentRecords: { tournamentId: {} },
    tournamentId: 'tournamentId',
    matchUpId: 'matchUpId',
    eventId: 'eventId',
    drawId: 'drawId',
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

test('matchUpActions returns MISSING_MATCHUP_ID when matchUpId is missing or not a string', () => {
  // @ts-ignore - matchUpId missing
  let result = matchUpActions({
    // @ts-ignore
    tournamentRecords: { tid: { tournamentId: 'tid' } },
    tournamentId: 'tid',
    drawDefinition: { drawId: 'd1' },
    drawId: 'd1',
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);

  // matchUpId is a number (not a string)
  result = matchUpActions({
    // @ts-ignore
    tournamentRecords: { tid: { tournamentId: 'tid' } },
    tournamentId: 'tid',
    drawDefinition: { drawId: 'd1' },
    // @ts-ignore
    matchUpId: 123,
    drawId: 'd1',
  });
  expect(result.error).toEqual(MISSING_MATCHUP_ID);
});

test('matchUpActions returns INVALID_VALUES for invalid sideNumber', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const matchUp = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED);

  // sideNumber = 3 is invalid (only 1 or 2 allowed)
  const result = tournamentEngine.matchUpActions({
    matchUpId: matchUp.matchUpId,
    sideNumber: 3,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

test('matchUpActions finds drawDefinition via brute force when not provided', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const matchUp = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED);

  // call matchUpActions without drawDefinition — forces the brute-force path
  const result = tournamentEngine.matchUpActions({
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.validActions).toBeDefined();
  expect(result.validActions.length).toBeGreaterThan(0);
});

test('matchUpActions returns MISSING_DRAW_DEFINITION when matchUp not found via brute force', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  // non-existent matchUpId — brute force search will not find drawDefinition
  const result = tournamentEngine.matchUpActions({
    matchUpId: 'nonExistentMatchUpId',
    drawId: 'anyDrawId',
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('matchUpActions respects requireAllPositionsAssigned scoring policy', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);

  // Attach scoring policy that requires all positions to be assigned before scoring
  const scoringPolicy = {
    [POLICY_TYPE_SCORING]: {
      requireAllPositionsAssigned: true,
      stage: {
        [MAIN]: {
          stageSequence: {
            1: {
              requireAllPositionsAssigned: true,
            },
          },
        },
      },
    },
  };
  tournamentEngine.attachPolicies({ policyDefinitions: scoringPolicy });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  // Remove a participant to create an unassigned position
  tournamentEngine.removeDrawPositionAssignment({
    drawPosition: 8,
    structureId,
    drawId,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });

  // Find a matchUp that still has both participants assigned
  const readyMatchUp = matchUps.find(
    (m) =>
      m.matchUpStatus === TO_BE_PLAYED &&
      m.roundNumber === 1 &&
      m.sides?.length === 2 &&
      m.sides.every((s) => s.participantId),
  );
  expect(readyMatchUp).toBeDefined();

  const result = tournamentEngine.matchUpActions({
    matchUpId: readyMatchUp.matchUpId,
    drawId,
  });

  const actionTypes = result.validActions?.map((a) => a.type) ?? [];
  // With not all positions assigned and requireAllPositionsAssigned: true,
  // SCORE action should NOT be present (scoring not active)
  expect(actionTypes).not.toContain(SCORE);

  // But SCHEDULE should still be available since isInComplete is true
  expect(actionTypes).toContain(SCHEDULE);
  // STATUS should still be available (depends on isInComplete and readyToScore)
  expect(actionTypes).toContain(STATUS);
});

it('matchUpActions includes ADD_PENALTY when sideNumber is provided and side has participant', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const readyMatchUp = matchUps.find(
    (m) => m.matchUpStatus === TO_BE_PLAYED && m.sides?.length === 2 && m.sides.every((s) => s.participantId),
  );
  expect(readyMatchUp).toBeDefined();

  // with sideNumber = 1, side has participant
  let result = tournamentEngine.matchUpActions({
    matchUpId: readyMatchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });
  let actionTypes = result.validActions?.map((a) => a.type) ?? [];
  expect(actionTypes).toContain(PENALTY);

  // with sideNumber = 2
  result = tournamentEngine.matchUpActions({
    matchUpId: readyMatchUp.matchUpId,
    sideNumber: 2,
    drawId,
  });
  actionTypes = result.validActions?.map((a) => a.type) ?? [];
  expect(actionTypes).toContain(PENALTY);
});

it('matchUpActions excludes ADD_PENALTY when sideNumber is provided but side has no participant', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 4 }],
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });

  // Find a matchUp where only one side has a participant (round 2 with some empty sides)
  const partialMatchUp = matchUps.find(
    (m) => m.matchUpStatus === TO_BE_PLAYED && m.roundNumber > 1 && m.sides?.some((s) => !s?.participantId),
  );

  if (partialMatchUp) {
    // Find a side without a participant
    const emptySide = partialMatchUp.sides?.find((s) => !s?.participantId);
    if (emptySide) {
      const result = tournamentEngine.matchUpActions({
        matchUpId: partialMatchUp.matchUpId,
        sideNumber: emptySide.sideNumber,
        drawId,
      });

      // When sideNumber is provided but that side has no participant, ADD_PENALTY should be excluded
      const actionTypes = result.validActions?.map((a) => a.type) ?? [];
      expect(actionTypes).not.toContain(PENALTY);
    }
  }
});

it('matchUpActions handles double exit matchUp with active downstream', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        participantsCount: 8,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 1,
            matchUpStatus: DOUBLE_WALKOVER,
          },
          {
            roundNumber: 1,
            roundPosition: 2,
            scoreString: '6-1 6-1',
            winningSide: 1,
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  const doubleWalkoverMatchUp = matchUps.find((m) => m.matchUpStatus === DOUBLE_WALKOVER);
  expect(doubleWalkoverMatchUp).toBeDefined();

  const result = tournamentEngine.matchUpActions({
    matchUpId: doubleWalkoverMatchUp.matchUpId,
    drawId,
  });

  expect(result.isDoubleExit).toBe(true);
  // The isDoubleExit flag should be returned
  expect(result.validActions).toBeDefined();
});

it('matchUpActions returns empty validActions when isByeMatchUp', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });

  const byeMatchUp = matchUps.find((m) => m.matchUpStatus === 'BYE');
  if (byeMatchUp) {
    const result = tournamentEngine.matchUpActions({
      matchUpId: byeMatchUp.matchUpId,
      drawId,
    });
    expect(result.isByeMatchUp).toBe(true);
    expect(result.validActions).toEqual([]);
  }
});

it('matchUpActions includes REFEREE action by default', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, participantsCount: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  const matchUp = matchUps.find((m) => m.matchUpStatus === TO_BE_PLAYED);

  const result = tournamentEngine.matchUpActions({
    matchUpId: matchUp.matchUpId,
    drawId,
  });

  const actionTypes = result.validActions.map((a) => a.type);
  expect(actionTypes).toContain(REFEREE);

  const refereeAction = result.validActions.find((a) => a.type === REFEREE);
  expect(refereeAction.payload.matchUpId).toEqual(matchUp.matchUpId);
});
