/**
 * Regression coverage for the exit-status propagation bug class that PR #4455
 * fixed: when an exit (WALKOVER/DEFAULT/DOUBLE_WALKOVER) propagates into a
 * downstream / consolation matchUp whose opponent draw position is a BYE, the
 * engine must NOT award the win to the empty/BYE side.
 *
 * Rather than assert a specific feed topology, these tests pin the structural
 * invariant across the whole draw after a variety of exit scenarios:
 *   (a) no matchUp ever has a winningSide that points at a BYE side, and
 *   (b) a matchUp converted to a double exit carries no winningSide.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER, DOUBLE_WALKOVER, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';

const DOUBLE_EXITS = [DOUBLE_WALKOVER, DOUBLE_DEFAULT];

/** The bug-class invariants, asserted over every matchUp in the tournament. */
function assertExitInvariants(matchUps: any[]) {
  for (const m of matchUps) {
    if (m.winningSide) {
      // (a) a winningSide must point at a side that holds a real participant —
      // never a BYE / empty side (the PR #4455 failure mode).
      const winner = m.sides?.find((s: any) => s.sideNumber === m.winningSide);
      expect(winner?.bye, `matchUp ${m.matchUpId} (${m.matchUpStatus}) advanced a BYE side`).not.toEqual(true);
      expect(winner?.participantId, `matchUp ${m.matchUpId} (${m.matchUpStatus}) advanced an empty side`).toBeTruthy();
    }
    // (b) a double-exit matchUp must have no winner.
    if (DOUBLE_EXITS.includes(m.matchUpStatus)) {
      expect(m.winningSide, `double-exit matchUp ${m.matchUpId} must have no winningSide`).toBeUndefined();
    }
  }
}

describe('FMLC / exit-status propagation never advances a BYE side', () => {
  it('FMLC-8, adjacent first-round walkovers (exits feed consolation)', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawId: 'fmlc-wos',
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          idPrefix: 'w',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: WALKOVER, winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: WALKOVER, winningSide: 1 },
            { roundNumber: 1, roundPosition: 3, matchUpStatus: WALKOVER, winningSide: 2 },
          ],
        },
      ],
    });
    assertExitInvariants(tournamentEngine.allTournamentMatchUps().matchUps);
  });

  it('FMLC-8 with byes, single walkover (lone exit-loser opposite a BYE in consolation)', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawId: 'fmlc-bye',
          drawSize: 8,
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          participantsCount: 6,
          idPrefix: 'b',
        },
      ],
    });
    // walk over a couple of playable first-round matchUps so their losers feed consolation
    const r1 = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m) => m.stage === 'MAIN' && m.roundNumber === 1 && m.matchUpStatus === 'TO_BE_PLAYED');
    for (const m of r1.slice(0, 2)) {
      const result: any = tournamentEngine.setMatchUpStatus({
        outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
        matchUpId: m.matchUpId,
        drawId: 'fmlc-bye',
      });
      expect(result.success).toEqual(true);
    }
    assertExitInvariants(tournamentEngine.allTournamentMatchUps().matchUps);
  });

  it('SINGLE_ELIMINATION-16, sparse (9 players) with cascading double walkovers — pairedPreviousMatchUpIsDoubleExit branch', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawId: 'se-sparse',
          drawSize: 16,
          participantsCount: 9,
          idPrefix: 's',
          outcomes: [
            { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
            { roundNumber: 1, roundPosition: 2, matchUpStatus: DOUBLE_WALKOVER },
          ],
        },
      ],
    });
    assertExitInvariants(tournamentEngine.allTournamentMatchUps().matchUps);
  });

  it('SINGLE_ELIMINATION-16, four adjacent double walkovers cascade (drives pairedPreviousMatchUpIsDoubleExit)', () => {
    mocksEngine.generateTournamentRecord({
      setState: true,
      drawProfiles: [
        {
          drawId: 'se-cascade',
          drawSize: 16,
          idPrefix: 'c',
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
    assertExitInvariants(matchUps);
    // R2P1/R2P2 and R3P1 must convert to a double exit with no winner displaced.
    const r3p1 = matchUps.find((m) => m.stage === 'MAIN' && m.roundNumber === 3 && m.roundPosition === 1);
    expect(DOUBLE_EXITS).toContain(r3p1?.matchUpStatus);
    expect(r3p1?.winningSide).toBeUndefined();
  });
});
