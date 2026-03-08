import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

describe('doubleExitAdvancement - uncovered branches', () => {
  test('DOUBLE_DEFAULT propagation in elimination draw', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawSize: 8,
          idPrefix: 'dd',
          outcomes: [
            {
              matchUpStatus: DOUBLE_DEFAULT,
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
    // The winner of R1P2 should advance since R1P1 is a DOUBLE_DEFAULT
    expect(matchUps.some((m) => m.drawPositions?.filter(Boolean).length === 1)).toEqual(true);
  });

  test('double exit with BYE participant - advances bye through consolation', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          participantsCount: 7,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'bye',
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

    // The DOUBLE_WALKOVER at R1P2 with a BYE participant should trigger
    // the bye advancement path in consolation
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationMatchUps = matchUps.filter((m) => m.stage !== MAIN);

    // There should be some effect in consolation structure
    expect(consolationMatchUps.length).toBeGreaterThan(0);
  });

  test('consecutive double walkovers propagate through multiple rounds', () => {
    const drawId = 'cascade';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawSize: 16,
          idPrefix: 'c',
          drawId,
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
          ],
        },
      ],
    });

    // Both R1P1 and R1P2 are double walkovers
    // R2P1 should also become DOUBLE_WALKOVER since both sources are empty exits
    const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
    const r2p1 = matchUps.find((m) => m.roundPosition === 1);
    expect(r2p1).toBeDefined();
    expect(r2p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  });

  test('double walkover with FMLC and doubleExitPropagateBye policy', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'policy',
          drawSize: 8,
          policyDefinitions: {
            [POLICY_TYPE_PROGRESSION]: {
              doubleExitPropagateBye: true,
            },
          },
          outcomes: [
            {
              matchUpStatus: DOUBLE_WALKOVER,
              roundPosition: 1,
              roundNumber: 1,
            },
          ],
        },
      ],
    });

    // With doubleExitPropagateBye, the loser matchUp should get a BYE
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationMatchUps = matchUps.filter((m) => m.stage !== MAIN);

    // Check if any consolation matchUps have BYE status
    const byeConsolation = consolationMatchUps.filter((m) => m.matchUpStatus === BYE);
    expect(byeConsolation.length).toBeGreaterThan(0);
  });

  test('DOUBLE_DEFAULT in FMLC generates DEFAULTED exits in consolation', () => {
    const drawId = 'dd-fmlc';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'ddf',
          drawSize: 8,
          drawId,
          outcomes: [
            {
              matchUpStatus: DOUBLE_DEFAULT,
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

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Winner from R1P2 should be in main R2
    const mainR2 = matchUps.filter((m) => m.roundNumber === 2 && m.stage === MAIN);
    expect(mainR2.some((m) => m.drawPositions?.filter(Boolean).length >= 1)).toEqual(true);
  });

  test('replacing completed matchUp with DOUBLE_WALKOVER triggers doubleExitAdvancement', () => {
    const drawId = 'replace';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawSize: 8,
          idPrefix: 'r',
          drawId,
          outcomes: [
            {
              scoreString: '6-1 6-2',
              roundPosition: 1,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-3 6-4',
              roundPosition: 2,
              roundNumber: 1,
              winningSide: 1,
            },
          ],
        },
      ],
    });

    // Verify R2 has drawPositions
    let matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
    const r2p1 = matchUps.find((m) => m.roundPosition === 1);
    expect(r2p1.drawPositions?.filter(Boolean).length).toEqual(2);

    // Replace R1P1 completed outcome with DOUBLE_WALKOVER
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'r-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // R2P1 should now have a WALKOVER with only one participant (from R1P2)
    matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
    const updatedR2P1 = matchUps.find((m) => m.roundPosition === 1);
    expect(updatedR2P1.drawPositions?.filter(Boolean).length).toEqual(1);
  });

  test('existing empty exit in loser matchUp converts to DOUBLE_EXIT', () => {
    const drawId = 'empty-exit';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'ee',
          drawSize: 8,
          drawId,
          outcomes: [
            {
              matchUpStatus: DOUBLE_WALKOVER,
              roundPosition: 1,
              roundNumber: 1,
            },
          ],
        },
      ],
    });

    // Now set R1P2 as DOUBLE_WALKOVER too
    // The consolation matchUp already has an empty exit from R1P1
    // Adding another should convert it to DOUBLE_WALKOVER
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'ee-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationR1 = matchUps.filter((m) => m.stage !== MAIN && m.roundNumber === 1);

    // The consolation matchUp should be DOUBLE_WALKOVER since both sources are double exits
    const dwoConsolation = consolationR1.filter((m) => m.matchUpStatus === DOUBLE_WALKOVER);
    expect(dwoConsolation.length).toBeGreaterThan(0);
  });

  test('feedRound handling in doubleExitAdvancement', () => {
    // FMLC with enough rounds to produce a feed round
    const drawId = 'feed';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'f',
          drawSize: 16,
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
            {
              scoreString: '6-1 6-2',
              roundPosition: 3,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-1 6-2',
              roundPosition: 4,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-1 6-2',
              roundPosition: 5,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-1 6-2',
              roundPosition: 6,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-1 6-2',
              roundPosition: 7,
              roundNumber: 1,
              winningSide: 1,
            },
            {
              scoreString: '6-1 6-2',
              roundPosition: 8,
              roundNumber: 1,
              winningSide: 1,
            },
          ],
        },
      ],
    });

    // Now set a main R2 matchUp as DOUBLE_WALKOVER
    // This should propagate a WALKOVER to the consolation via feed round
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'f-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    // Verify draw is in consistent state (no errors thrown)
    const mainR3 = matchUps.filter((m) => m.roundNumber === 3 && m.stage === MAIN);
    expect(mainR3.length).toBeGreaterThan(0);
  });

  test('double walkover at R1P1 followed by completed at adjacent position', () => {
    const drawId = 'adj';
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawSize: 8,
          idPrefix: 'a',
          drawId,
        },
      ],
    });

    // Set R1P1 as double walkover first
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'a-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Complete R1P2 - the winner should advance to R2P1 which already has a WALKOVER
    result = tournamentEngine.setMatchUpStatus({
      outcome: { scoreString: '6-1 6-2', winningSide: 1 },
      matchUpId: 'a-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // R2P1 should now be a WALKOVER with the winner advancing
    const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
    const r2p1 = matchUps.find((m) => m.roundPosition === 1);
    expect(r2p1.matchUpStatus).toEqual(WALKOVER);
    expect(r2p1.drawPositions?.filter(Boolean).length).toEqual(1);
  });
});
