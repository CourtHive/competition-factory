import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { BYE, COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

test('doubleExitAdvancement', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 1,
            roundNumber: 1,
          },
          {
            scoreString: '6-1 6-2',
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
        ],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;

  expect(matchUps.map((m) => m.drawPositions).filter(Boolean)).toEqual([[3]]);
});

test('doubleExitAdvancement with BYE', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        participantsCount: 7,
        seedsCount: 1,
        drawSize: 8,
        outcomes: [
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 2,
            roundNumber: 1,
          },
        ],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [3] } }).matchUps;

  expect(matchUps.map((m) => m.drawPositions).filter(Boolean)).toEqual([[1]]);
});

test('doubleExitAdvancement with progression policy', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        policyDefinitions: {
          [POLICY_TYPE_PROGRESSION]: {
            doubleExitPropagateBye: true,
          },
        },
        drawSize: 8,
        outcomes: [
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 1,
            roundNumber: 1,
          },
          {
            scoreString: '6-1 6-2',
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
        ],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { roundNumbers: [2] },
    contextFilters: { stages: [MAIN] },
  }).matchUps;

  expect(matchUps.map((m) => m.drawPositions).filter(Boolean)).toEqual([[3]]);
});

test('triple doubleExitAdvancement', () => {
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawSize: 16,
        outcomes: [
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 1,
            roundNumber: 1,
          },
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 2,
            roundNumber: 1,
          },
          {
            matchUpStatus: DOUBLE_WALKOVER,
            roundPosition: 3,
            roundNumber: 1,
          },
          {
            scoreString: '6-1 6-2',
            roundPosition: 4,
            roundNumber: 1,
            winningSide: 1,
          },
        ],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [4] } }).matchUps;
  expect(matchUps.map((m) => m.drawPositions).filter(Boolean)).toEqual([[7]]);
});

test('completed changed to doubleExit', () => {
  const drawId = 'draw-1';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        idPrefix: 'match',
        drawSize: 8,
        drawId,
        outcomes: [
          {
            scoreString: '6-1 6-2',
            roundPosition: 1,
            roundNumber: 1,
            winningSide: 1,
          },
          {
            scoreString: '6-1 6-2',
            roundPosition: 2,
            roundNumber: 1,
            winningSide: 1,
          },
        ],
      },
    ],
  });

  let matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  expect(matchUps.map((m) => m.matchUpStatus)).toEqual([COMPLETED, COMPLETED, TO_BE_PLAYED, TO_BE_PLAYED]);
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-1-1',
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [3] } }).matchUps;
  expect(matchUps.map((m) => m.drawPositions).filter(Boolean)).toEqual([[3]]);
});

test('doubleExitAdvancement of BYE encountering drawPosition', () => {
  const drawId = 'draw-2';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        participantsCount: 7,
        idPrefix: 'match',
        seedsCount: 1,
        drawSize: 8,
        drawId,
      },
    ],
  });

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { structureId } = drawDefinition.structures[0];

  const validActions = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  }).validActions;
  const { method, payload } = validActions.find((action) => action.type === BYE);
  const assignByeResult = tournamentEngine[method](payload);
  expect(assignByeResult.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([
    ['match-1-2', 'TO_BE_PLAYED'],
    ['match-1-3', 'TO_BE_PLAYED'],
    ['match-1-4', 'TO_BE_PLAYED'],
    ['match-1-1', 'BYE'],
  ]);

  let setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: 'match-1-3',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);
  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: 'match-1-4',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([
    ['match-2-2', TO_BE_PLAYED],
    ['match-2-1', BYE],
  ]);

  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: 'match-2-2',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-1-2',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
  /**
   * `match-2-1` STAYS A BYE. Both of its feeding drawPositions carry draw BYEs — the assertion
   * above already reads it as `BYE` before the double walkover is entered — so it is a BYE whatever
   * arrives beside it.
   *
   * CA, 2026-09-20: *"An advancing participant encountering a BYE should always be advanced; a
   * propagated exit encountering a BYE should be advanced. In both cases the BYE remains a BYE"* —
   * and, asked to be unambiguous, *"the BYE remains a BYE means the `matchUpStatus: BYE` does not
   * change."*
   *
   * This previously expected `WALKOVER`: the produced exit OVERWROTE the BYE. Re-authored under
   * that ruling, confirmed by CA against this exact scenario driven in TMX.
   *
   * The exit is not lost by staying out of the status — `match-3-1` below is still a WALKOVER, so
   * it travelled onward exactly as before.
   */
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([
    ['match-2-2', COMPLETED],
    ['match-2-1', BYE],
  ]);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [3] } }).matchUps;
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([['match-3-1', 'WALKOVER']]);
});

test('doubleExitAdvancement of BYE encountering WALKOVER', () => {
  const drawId = 'draw-3';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        participantsCount: 15,
        idPrefix: 'match',
        seedsCount: 1,
        drawSize: 16,
        drawId,
      },
    ],
  });

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const { structureId } = drawDefinition.structures[0];

  const validActions = tournamentEngine.positionActions({
    drawPosition: 1,
    structureId,
    drawId,
  }).validActions;
  const { method, payload } = validActions.find((action) => action.type === BYE);
  const assignByeResult = tournamentEngine[method](payload);
  expect(assignByeResult.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  expect(matchUps.find((m) => m.matchUpId === 'match-1-1').matchUpStatus).toEqual('BYE');

  let setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: 'match-1-3',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);
  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: 1 },
    matchUpId: 'match-1-4',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: DOUBLE_WALKOVER },
    matchUpId: 'match-2-2',
    drawId,
  });
  expect(setStatusResult.error).toEqual(INVALID_WINNING_SIDE);

  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-2-2',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  setStatusResult = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'match-1-2',
    drawId,
  });
  expect(setStatusResult.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
  // `match-2-1` stays a BYE for the same reason as the test above — measured: both its feeding
  // drawPositions carry draw BYEs and it holds no participant. See that test for CA's ruling.
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([
    ['match-2-2', DOUBLE_WALKOVER],
    ['match-2-3', TO_BE_PLAYED],
    ['match-2-4', TO_BE_PLAYED],
    ['match-2-1', BYE],
  ]);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [3] } }).matchUps;
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([
    ['match-3-1', 'WALKOVER'],
    ['match-3-2', 'TO_BE_PLAYED'],
  ]);

  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [4] } }).matchUps;
  expect(matchUps.map((m) => [m.matchUpId, m.matchUpStatus])).toEqual([['match-4-1', 'WALKOVER']]);
});
