/**
 * Regression tests for GitHub Issues #3847 and #3848
 *
 * #3847: Two DOUBLE_WALKOVER results in main draw that feed the same
 *        consolation match should produce a DOUBLE_WALKOVER in the
 *        consolation, not a match with a winning side.
 *
 * #3848: In FMLC, DOUBLE_WALKOVER status codes in first-round consolation
 *        don't propagate correctly to second-round consolation matches.
 *        The code looks up the wrong "previous match" when calculating
 *        the result of the second-round consolation match.
 */

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

// Helper to find a matchUp by stage, roundNumber, and roundPosition
const getTarget = (params: { matchUps: any[]; roundNumber: number; roundPosition: number; stage?: string }) => {
  const { matchUps, roundNumber, roundPosition, stage } = params;
  return matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition &&
      (!stage || matchUp.stage === stage),
  );
};

/**
 * Issue #3847: Two DOUBLE_WALKOVERs feeding same consolation match
 *
 * In FMLC drawSize 8, main R1P1 and R1P2 both feed consolation R1P1.
 * When both are DOUBLE_WALKOVER, consolation R1P1 should also be
 * DOUBLE_WALKOVER with no winningSide (no real participant entered).
 */
describe('Issue #3847: Two DOUBLE_WALKOVERs feeding same consolation match', () => {
  it('should produce DOUBLE_WALKOVER in consolation when both feeder main draw matches are DOUBLE_WALKOVER', () => {
    const drawId = 'issue3847';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'i3847',
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set Main R1P1 as DOUBLE_WALKOVER
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN }).matchUpStatus).toEqual(
      DOUBLE_WALKOVER,
    );

    // Set Main R1P2 as DOUBLE_WALKOVER
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Consolation R1P1 should be DOUBLE_WALKOVER with no winning side
    const consolationR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolationR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolationR1P1.winningSide).toBeUndefined();
  });

  it('should produce DOUBLE_WALKOVER when main draw DOUBLE_WALKOVERs are entered in reverse order', () => {
    const drawId = 'i3847r';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'i3847r',
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Enter DOUBLE_WALKOVER in reverse order: R1P2 first, then R1P1
    let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN });
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN });
    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Same result regardless of order
    const consolationR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolationR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolationR1P1.winningSide).toBeUndefined();
  });
});

/**
 * Issue #3848: DOUBLE_WALKOVER propagation in FMLC consolation rounds
 *
 * In FMLC drawSize 16, after completing all main R1 matches, setting
 * consolation R1 matches as DOUBLE_WALKOVER should produce correct
 * status codes in consolation R2 (referencing the consolation R1 match,
 * not the main draw match).
 */
describe('Issue #3848: DOUBLE_WALKOVER propagation in FMLC consolation rounds', () => {
  it('should correctly propagate WO status codes from consolation R1 to consolation R2', () => {
    const drawId = 'issue3848';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'i3848',
          drawSize: 16,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-1 6-1',
      winningSide: 1,
    });

    // Complete all 8 first-round main draw matches (populates consolation with losers)
    for (let rp = 1; rp <= 8; rp++) {
      const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: rp, stage: MAIN });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: targetMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set all first-round consolation matches (that have real players) as DOUBLE_WALKOVER
    const consolationR1MatchUps = matchUps
      .filter(
        (m) =>
          m.stage === CONSOLATION &&
          m.roundNumber === 1 &&
          m.matchUpStatus !== BYE &&
          m.sides?.filter((s) => s.participantId).length === 2,
      )
      .sort((a, b) => a.roundPosition - b.roundPosition);

    for (const cm of consolationR1MatchUps) {
      const result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: cm.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // All consolation R2 matches with a fed participant should be WALKOVER
    const consolationR2MatchUps = matchUps
      .filter((m) => m.stage === CONSOLATION && m.roundNumber === 2)
      .sort((a, b) => a.roundPosition - b.roundPosition);

    for (const cm of consolationR2MatchUps) {
      if (cm.sides?.filter((s) => s.participantId).length > 0) {
        expect(cm.matchUpStatus).toEqual(WALKOVER);
      }
    }
  });

  it('should correctly look up the consolation first-round match (not main draw match) for R2 propagation', () => {
    const drawId = 'i3848s';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'i3848s',
          drawSize: 16,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Complete all main draw R1 matches
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-2 6-3',
      winningSide: 1,
    });
    for (let rp = 1; rp <= 8; rp++) {
      const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: rp, stage: MAIN });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: targetMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set consolation R1P1 and R1P2 as DOUBLE_WALKOVER
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    const consolR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: CONSOLATION });

    let result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: consolR1P1.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId: consolR1P2.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    /**
     * BOTH CONSOLATION R2 MATCHES ARE BYEs, and the comment that stood here was wrong about why.
     *
     * It said *"(fed participant wins)"*. Measured 2026-09-20: `Consolation|2|1` holds drawPosition
     * 1 and NOTHING else — dp1 is a draw BYE and the other side is empty. Zero participants. Nobody
     * was fed, so nobody could win. CA confirmed the comment is wrong, not just the expectation.
     *
     * These previously expected `WALKOVER`, the produced exit overwriting the BYE. CA, 2026-09-20:
     * *"a propagated exit encountering a BYE should be advanced. In both cases the BYE remains a
     * BYE"* — *"the `matchUpStatus: BYE` does not change."*
     *
     * The exit still reaches these matchUps; it is recorded on the side it arrived on and carried
     * onward, which is what `sideExitProvenance` is for. The BYE is a fact about the DRAW and the
     * cascade does not get to overwrite it.
     */
    const consolR2P1 = getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: CONSOLATION });
    const consolR2P2 = getTarget({ matchUps, roundNumber: 2, roundPosition: 2, stage: CONSOLATION });

    expect(consolR2P1?.matchUpStatus).toEqual(BYE);
    expect(consolR2P2?.matchUpStatus).toEqual(BYE);
    // CONTROL: BYE here must mean a DRAW bye rather than an empty matchUp — neither holds a
    // participant, which is exactly why "fed participant wins" could never have been true.
    for (const matchUp of [consolR2P1, consolR2P2]) {
      expect((matchUp?.sides ?? []).filter((side: any) => side.participantId).length).toEqual(0);
    }

    // R2P2 status codes should reference the consolation R1 DOUBLE_WALKOVER
    // (not the main draw match), showing DOUBLE_WALKOVER as previousMatchUpStatus
    const r2p2StatusCodes = consolR2P2?.matchUpStatusCodes;
    expect(r2p2StatusCodes).toBeDefined();
    const r2p2PreviousStatuses = r2p2StatusCodes?.map((sc) => sc.previousMatchUpStatus);
    expect(r2p2PreviousStatuses).toContain(DOUBLE_WALKOVER);
  });
});

/**
 * Issue #3847 simplified: drawSize 8 FMLC via outcomes and all-4 scenarios
 */
describe('Issue #3847 simplified: drawSize 8 FMLC', () => {
  it('should handle two adjacent DOUBLE_WALKOVERs feeding same consolation match (drawSize: 8)', () => {
    const drawId = 'simple8';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'simple8',
          drawSize: 8,
          drawId,
          outcomes: [
            { matchUpStatus: DOUBLE_WALKOVER, roundPosition: 1, roundNumber: 1 },
            { matchUpStatus: DOUBLE_WALKOVER, roundPosition: 2, roundNumber: 1 },
          ],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Main draw verifications
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: MAIN }).matchUpStatus).toEqual(
      DOUBLE_WALKOVER,
    );
    expect(getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: MAIN }).matchUpStatus).toEqual(
      DOUBLE_WALKOVER,
    );
    expect(getTarget({ matchUps, roundNumber: 2, roundPosition: 1, stage: MAIN }).matchUpStatus).toEqual(
      DOUBLE_WALKOVER,
    );

    // Consolation R1P1 should be DOUBLE_WALKOVER with no winningSide
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    expect(consolR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolR1P1.winningSide).toBeUndefined();
  });

  it('should handle DOUBLE_WALKOVER feeding consolation from all 4 main draw R1 matches', () => {
    const drawId = 'allDWO8';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'allDWO',
          drawSize: 8,
          drawId,
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Set ALL 4 main draw R1 matches as DOUBLE_WALKOVER
    for (let rp = 1; rp <= 4; rp++) {
      const targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: rp, stage: MAIN });
      const result = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: DOUBLE_WALKOVER },
        matchUpId: targetMatchUp.matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
      matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    }

    matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

    // Both consolation R1 matches should be DOUBLE_WALKOVER (no real losers entered)
    const consolR1P1 = getTarget({ matchUps, roundNumber: 1, roundPosition: 1, stage: CONSOLATION });
    const consolR1P2 = getTarget({ matchUps, roundNumber: 1, roundPosition: 2, stage: CONSOLATION });

    expect(consolR1P1.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolR1P1.winningSide).toBeUndefined();
    expect(consolR1P2.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(consolR1P2.winningSide).toBeUndefined();
  });
});
