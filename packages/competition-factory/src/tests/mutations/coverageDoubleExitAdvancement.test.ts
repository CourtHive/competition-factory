/**
 * Coverage tests for doubleExitAdvancement.ts
 * Targets uncovered lines: 81-149, 396-409, 429-476, 487-525
 */
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  WALKOVER,
  DEFAULTED,
  TO_BE_PLAYED,
  BYE,
} from '@Constants/matchUpStatusConstants';

describe('doubleExitAdvancement coverage', () => {
  it('multiple double walkovers in same FMLC round hit loserMatchUpIsEmptyExit branch', () => {
    // Scenario 1: Two adjacent double walkovers in FMLC R1 feed into the same consolation area.
    // The first DWO creates an empty exit in consolation; the second converts it to DOUBLE_WALKOVER (lines 81-118).
    const drawId = 'fmlc-multi';
    const {
      tournamentRecord,
      drawIds: [id],
    } = mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'fm',
          outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER }],
        },
      ],
    });
    expect(id).toEqual(drawId);

    tournamentEngine.setState(tournamentRecord);

    // Verify the first double walkover propagated
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationMatchUps = matchUps.filter((m) => m.stage === CONSOLATION);
    expect(consolationMatchUps.length).toBeGreaterThan(0);

    // Now apply a second DOUBLE_WALKOVER to the adjacent R1 matchUp (roundPosition 2)
    // This matchUp feeds into the SAME consolation matchUp as R1P1
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 'fm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // The consolation R1 matchUp receiving both exits should now be DOUBLE_WALKOVER
    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationR1 = matchUps.filter((m) => m.stage === CONSOLATION && m.roundNumber === 1);
    const dwoInConsolation = consolationR1.filter((m) => m.matchUpStatus === DOUBLE_WALKOVER);
    expect(dwoInConsolation.length).toBeGreaterThan(0);
  });

  it('double walkover propagation through winner bracket hits existingExit and pairedPreviousMatchUpIsDoubleExit', () => {
    // Scenario 2: Two adjacent DWOs in 16-draw elimination.
    // R1P1 = DWO, R1P2 = DWO => R2P1 becomes DOUBLE_WALKOVER (existingExit branch lines 396-409).
    // This also triggers the pairedPreviousMatchUpIsDoubleExit branch (lines 487-525).
    const drawId = 'elim-cascade';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          idPrefix: 'ec',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // R2P1 should be DOUBLE_WALKOVER since both feeding R1 matchUps are double exits
    const r2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    expect(r2p1).toBeDefined();
    expect(r2p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // R3P1 should also propagate — it receives the DOUBLE_WALKOVER from R2P1
    // and a WALKOVER from R2P2 (which has no drawPositions from the double exit side)
    const r3p1 = matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1 && m.stage === MAIN);
    expect(r3p1).toBeDefined();
    // R3P1 will be some form of exit status (WALKOVER or DOUBLE_WALKOVER)
    expect([WALKOVER, DOUBLE_WALKOVER].includes(r3p1.matchUpStatus)).toEqual(true);
  });

  it('DOUBLE_DEFAULT propagation tests EXIT derivation from DOUBLE_DEFAULT', () => {
    // Scenario 3: Same as scenario 2 but with DOUBLE_DEFAULT.
    // Tests lines 85-86 where DOUBLE_EXIT = DOUBLE_DEFAULT and EXIT = DEFAULTED.
    const drawId = 'dd-cascade';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          idPrefix: 'dd',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_DEFAULT },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_DEFAULT },
          ],
        },
      ],
    });

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // R2P1 should be DOUBLE_DEFAULT since both feeding R1 matchUps are DOUBLE_DEFAULT
    const r2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    expect(r2p1).toBeDefined();
    expect(r2p1.matchUpStatus).toEqual(DOUBLE_DEFAULT);

    // Verify R1 matchUps retained their DOUBLE_DEFAULT status
    const r1Exits = matchUps.filter((m) => m.roundNumber === 1 && m.stage === MAIN && [1, 2].includes(m.roundPosition));
    for (const m of r1Exits) {
      expect(m.matchUpStatus).toEqual(DOUBLE_DEFAULT);
    }
  });

  it('double exit with bye in consolation tests winnerHadBye and targetFedIn branches', () => {
    // Scenario 4: 16-draw FMLC with fewer participants so byes exist.
    // Apply DOUBLE_WALKOVER to R1 matchUps adjacent to byes.
    // When a DWO is adjacent to a BYE in R1, the bye-advanced participant in R2
    // gets a WALKOVER exit which exercises the bye-related branches.
    const drawId = 'fmlc-bye';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          participantsCount: 12,
          idPrefix: 'fb',
        },
      ],
    });

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1);
    const byeMatchUps = mainR1.filter((m) => m.matchUpStatus === BYE);
    expect(byeMatchUps.length).toBeGreaterThan(0);

    // Find a TO_BE_PLAYED R1 matchUp whose paired R1 is a BYE
    // (they share the same R2 target). Paired = adjacent roundPositions: (1,2), (3,4), etc.
    const tbpMatchUps = mainR1.filter((m) => m.matchUpStatus === TO_BE_PLAYED);
    const matchUpAdjacentToBye = tbpMatchUps.find((m) => {
      const rp = m.roundPosition;
      const pairedRP = rp % 2 === 1 ? rp + 1 : rp - 1;
      return byeMatchUps.some((b) => b.roundPosition === pairedRP);
    });

    if (matchUpAdjacentToBye) {
      // Apply DOUBLE_WALKOVER to this matchUp — the adjacent bye means the R2 target
      // already has a bye-advanced participant, exercising the bye advancement path
      const result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: matchUpAdjacentToBye.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);

      matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const updated = matchUps.find((m) => m.matchUpId === matchUpAdjacentToBye.matchUpId);
      expect(updated.matchUpStatus).toEqual(DOUBLE_WALKOVER);

      // The R2 matchUp should have the bye-advanced participant progressing via WALKOVER
      const mainR2 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 2);
      const r2Target = mainR2.find((m) =>
        m.drawPositions?.some((dp) => matchUpAdjacentToBye.drawPositions?.includes(dp)),
      );
      if (r2Target) {
        expect([WALKOVER, BYE].includes(r2Target.matchUpStatus)).toEqual(true);
      }
    }
  });

  it('DOUBLE_DEFAULT in FMLC hits loserMatchUpIsEmptyExit with DEFAULTED exit type', () => {
    // This tests lines 85-86 specifically in the loserMatchUpIsEmptyExit branch
    // where DOUBLE_EXIT = DOUBLE_DEFAULT and EXIT = DEFAULTED
    const drawId = 'dd-fmlc-empty';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'de',
          outcomes: [{ roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_DEFAULT }],
        },
      ],
    });

    // Now set the adjacent R1 matchUp as DOUBLE_DEFAULT
    // The consolation matchUp already has a DEFAULTED empty exit from the first one
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_DEFAULT },
      matchUpId: 'de-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const consolationR1 = matchUps.filter((m) => m.stage === CONSOLATION && m.roundNumber === 1);

    // The consolation matchUp should now be DOUBLE_DEFAULT
    const ddInConsolation = consolationR1.filter((m) => m.matchUpStatus === DOUBLE_DEFAULT);
    expect(ddInConsolation.length).toBeGreaterThan(0);
  });

  it('four adjacent DWOs in 16-draw elimination cascade through multiple rounds', () => {
    // This heavily exercises the existingExit branch (lines 396-409) and
    // pairedPreviousMatchUpIsDoubleExit (lines 487-525) recursively.
    const drawId = 'quad-dwo';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          idPrefix: 'q',
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

    // R2P1 and R2P2 should both be DOUBLE_WALKOVER
    const r2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    const r2p2 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 2 && m.stage === MAIN);
    expect(r2p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(r2p2.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // R3P1 should also be DOUBLE_WALKOVER since both R2 feeds are double exits
    const r3p1 = matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1 && m.stage === MAIN);
    expect(r3p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  });

  it('DWO then completed adjacent matchUp tests walkoverWinningSide advancement with bye', () => {
    // Generate 16-draw FMLC with a BYE and complete some matchUps, then apply DWO
    // to exercise the assignment?.bye path (lines 429-476)
    const drawId = 'bye-adv';
    const {
      tournamentRecord,
      drawIds: [id],
    } = mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          participantsCount: 14,
          idPrefix: 'ba',
        },
      ],
    });
    expect(id).toEqual(drawId);

    tournamentEngine.setState(tournamentRecord);

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const mainR1 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 1);
    const byeR1 = mainR1.filter((m) => m.matchUpStatus === BYE);
    expect(byeR1.length).toEqual(2);

    // Find a R2 matchUp that has a bye-advanced participant
    const mainR2 = matchUps.filter((m) => m.stage === MAIN && m.roundNumber === 2);
    const r2WithBye = mainR2.find((m) => m.drawPositions?.filter(Boolean).length === 1);

    if (r2WithBye) {
      // Find the paired R1 matchUp that still needs to be played
      const pairedR1 = mainR1.find(
        (m) => m.matchUpStatus === TO_BE_PLAYED && m.drawPositions?.some((dp) => r2WithBye.drawPositions?.includes(dp)),
      );

      if (pairedR1) {
        // Apply DOUBLE_WALKOVER to the paired R1 matchUp
        // The BYE-advanced position in R2 means the WO/WO is adjacent to a bye advancement
        const result = tournamentEngine.setMatchUpStatus({
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
          matchUpId: pairedR1.matchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);

        matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
        const updatedR2 = matchUps.find((m) => m.matchUpId === r2WithBye.matchUpId);
        // The R2 matchUp should be a WALKOVER since one side is empty (from DWO) and other has bye-advanced player
        expect([WALKOVER, DOUBLE_WALKOVER, BYE].includes(updatedR2.matchUpStatus)).toEqual(true);
      }
    }
  });

  it('three DWOs in 16-draw FMLC tests cascading consolation effects', () => {
    // Three adjacent DWOs in FMLC create cascading effects in consolation structure
    const drawId = 'fmlc-three';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'ft',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 3, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });

    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main R2P1 should be DOUBLE_WALKOVER
    const mainR2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    expect(mainR2p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // Consolation structure should have multiple exits
    const consolationExits = matchUps.filter(
      (m) =>
        m.stage === CONSOLATION && [WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(m.matchUpStatus),
    );
    expect(consolationExits.length).toBeGreaterThan(0);
  });

  it('sequential DWO application via setMatchUpStatus exercises all branches incrementally', () => {
    // Start with a clean 16-draw elimination and apply DWOs one at a time
    // to ensure each branch is hit in sequence
    const drawId = 'seq';
    mocksEngine.generateTournamentRecord({
      policyDefinitions: PRODUCED_EXIT_POLICY,
      setState: true,
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          idPrefix: 's',
        },
      ],
    });

    // Apply DWO to R1P1
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 's-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    let r2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    // R2P1 should be WALKOVER with no drawPositions (empty exit)
    expect(r2p1.matchUpStatus).toEqual(WALKOVER);

    // Now apply DWO to R1P2 — the paired previous matchUp for R2P1
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 's-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    r2p1 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 1 && m.stage === MAIN);
    // R2P1 should now be DOUBLE_WALKOVER (existingExit branch triggered)
    expect(r2p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // Now apply DWO to R1P3 and R1P4 to cascade further
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 's-1-3',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: 's-1-4',
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const r2p2 = matchUps.find((m) => m.roundNumber === 2 && m.roundPosition === 2 && m.stage === MAIN);
    expect(r2p2.matchUpStatus).toEqual(DOUBLE_WALKOVER);

    // R3P1 should be DOUBLE_WALKOVER — pairedPreviousMatchUpIsDoubleExit branch
    const r3p1 = matchUps.find((m) => m.roundNumber === 3 && m.roundPosition === 1 && m.stage === MAIN);
    expect(r3p1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  });
});
