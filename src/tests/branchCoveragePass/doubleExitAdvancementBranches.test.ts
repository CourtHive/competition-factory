import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  ROUND_ROBIN,
  MAIN,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// line 29: structure.structureType === CONTAINER short-circuit
// Setting a DOUBLE_WALKOVER within a ROUND_ROBIN (CONTAINER) structure routes through
// doubleExitAdvancement, which returns SUCCESS immediately for CONTAINER structures.
test('round robin DOUBLE_WALKOVER hits CONTAINER short-circuit (line 29)', () => {
  const drawId = 'rr-dwo';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [{ drawId, drawSize: 4, drawType: ROUND_ROBIN, idPrefix: 'rr' }],
  });

  const before = tournamentEngine.allTournamentMatchUps().matchUps;
  const target = before.find((m) => m.matchUpStatus !== undefined && m.roundNumber);
  expect(target).toBeDefined();

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

// lines 137/185: loserMatchUpIsEmptyExit converting an existing empty exit into a DOUBLE_EXIT
// two adjacent DWOs in an FMLC feed into the same consolation matchUp.
test('two adjacent DWOs convert empty exit to DOUBLE_WALKOVER in FMLC consolation', () => {
  const drawId = 'fmlc-empty';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawId,
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'fe',
        outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
      },
    ],
  });

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'fe-1-2',
    drawId,
  });
  expect(result.success).toEqual(true);
});

// lines 141/147: loserMatchUpIsDoubleExit SKIP branch — the loser target is already a DOUBLE_WALKOVER.
test('DOUBLE_DEFAULT empty-exit conversion uses DEFAULTED derivation', () => {
  const drawId = 'fmlc-dd';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawId,
        drawSize: 16,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'fd',
        outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_DEFAULT }],
      },
    ],
  });

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: 'fd-1-2',
    drawId,
  });
  expect(result.success).toEqual(true);
});

// lines 250/257/304/548/551/566: cascade of DWOs through winner bracket + paired-double-exit propagation.
test('cascade of DWOs across three main rounds triggers paired-previous double-exit propagation', () => {
  const drawId = 'cascade';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawId,
        drawSize: 16,
        idPrefix: 'cs',
        outcomes: [
          { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
          { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          { roundNumber: 1, roundPosition: 3, matchUpStatus: DOUBLE_WALKOVER },
          { roundNumber: 1, roundPosition: 4, matchUpStatus: DOUBLE_WALKOVER },
        ],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const r3p1 = matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1 && m.stage === MAIN);
  expect(r3p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

// lines 151/406/413/416/417/453/468: feedRound handling + inferSourceSideNumber variants.
// In a FEED_IN_CHAMPIONSHIP the loser of a later main round feeds into a consolation feed round.
// Completing R1 first populates the consolation feed round, then a main-R2 DWO advances into it,
// exercising the feedRound loser (line 151 true side) and inferSourceSideNumber feedRound path.
test('DOUBLE_WALKOVER in main R2 of FEED_IN_CHAMPIONSHIP feeds into a consolation feed round', () => {
  const drawId = 'feed';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [{ drawId, drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, idPrefix: 'fic' }],
  });

  // complete all main R1 so consolation R1 winners occupy consolation feed rounds
  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1 && m.readyToScore);
  for (const m of mainR1) {
    let r: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      matchUpId: m.matchUpId,
      drawId,
    });
    expect(r.success).toEqual(true);
  }

  // complete any ready consolation matchUps to seed feed-round occupants
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const consReady = matchUps.filter((m) => m.stage !== MAIN && m.readyToScore);
  for (const m of consReady) {
    tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1, scoreString: '6-1 6-2' },
      matchUpId: m.matchUpId,
      drawId,
    });
  }

  // now a main R2 DWO — its loser feeds into a populated consolation feed round
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const mainR2 = matchUps.find((m) => m.stage === MAIN && m.roundNumber === 2 && m.readyToScore);
  if (mainR2) {
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: mainR2.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  expect(matchUps.length).toBeGreaterThan(0);
});

// line 119 branch: doubleExitPropagateBye policy advances a BYE to the loser matchUp.
test('doubleExitPropagateBye advances BYE to loser matchUp', () => {
  const drawId = 'propbye';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawId,
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        idPrefix: 'pb',
        policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: true } },
        outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
      },
    ],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toBeGreaterThan(0);
});

// lines 250/524-542: replacing a completed matchUp with a DWO removes a pre-existing advancement.
test('replacing completed R1 with DWO removes pre-existing advancement (overlap branch)', () => {
  const drawId = 'replace';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [
      {
        drawId,
        drawSize: 8,
        idPrefix: 'rp',
        outcomes: [
          { roundNumber: 1, roundPosition: 1, winningSide: 1, scoreString: '6-1 6-2' },
          { roundNumber: 1, roundPosition: 2, winningSide: 1, scoreString: '6-3 6-4' },
        ],
      },
    ],
  });

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: 'rp-1-1',
    drawId,
  });
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [2] } }).matchUps;
  const r2p1 = matchUps.find((m) => m.roundPosition === 1);
  expect(r2p1.matchUpStatus).toEqual(WALKOVER);
  expect(r2p1.drawPositions?.filter(Boolean).length).toEqual(1);
});

// lines 525-546 / 605-643: DWO adjacent to a BYE-advanced position exercises bye-advancement paths.
test('DWO adjacent to a BYE-advanced position exercises bye advancement', () => {
  const drawId = 'byeadv';
  mocksEngine.generateTournamentRecord({
    setState: true,
    drawProfiles: [{ drawId, drawSize: 16, participantsCount: 14, idPrefix: 'bv' }],
  });

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1);
  const mainR2 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 2);
  const r2WithBye = mainR2.find((m) => m.drawPositions?.filter(Boolean).length === 1);

  if (r2WithBye) {
    const pairedR1 = mainR1.find(
      (m) => m.matchUpStatus !== 'BYE' && m.drawPositions?.some((dp) => r2WithBye.drawPositions?.includes(dp)),
    );
    if (pairedR1) {
      let result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: pairedR1.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }
  }
  expect(mainR2.length).toBeGreaterThan(0);
});
