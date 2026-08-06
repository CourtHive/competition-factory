import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, describe, test } from 'vitest';

// constants and types
import { RETIRED } from '@Constants/matchUpStatusConstants';

// Regression coverage for competition-factory#4564 — score strings are derived from score.sets and
// are never accepted from the caller. Previously generation was skipped whenever the caller supplied
// scoreStringSide1, so an integration sending its own strings bypassed generation permanently.

const TB10_FORMAT = 'SET3-S:6/TB7-F:TB10';
const DRAW_ID = 'drawId';
const MATCHUP_ID = 'm-1-1';

function seedMatchUp(matchUpFormat?: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 2, idPrefix: 'm', matchUpFormat }],
    setState: true,
  });
}

function getMatchUp() {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return matchUps.find((matchUp: any) => matchUp.matchUpId === MATCHUP_ID);
}

describe('score strings are derived from score.sets', () => {
  test('caller-supplied score strings are discarded and regenerated', () => {
    seedMatchUp(TB10_FORMAT);

    // Shape observed in production: the deciding-tiebreak score [4-1] exists only inside the
    // caller's string, the trailing (0-0) is the live point score, and RET is the outcome token.
    // None of the three are producible by generateScoreString.
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: MATCHUP_ID,
      drawId: DRAW_ID,
      outcome: {
        matchUpStatus: RETIRED,
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 1, side2Score: 6, winningSide: 2 },
            { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
            { setNumber: 3, side1Score: 0, side2Score: 0 },
          ],
          scoreStringSide1: '1-6 6-4 [4-1](0-0) RET',
          scoreStringSide2: '6-1 4-6 [1-4](0-0) RET',
        },
      },
    });
    expect(result.success).toBe(true);

    const matchUp = getMatchUp();
    expect(matchUp.score.scoreStringSide1).not.toBe('1-6 6-4 [4-1](0-0) RET');
    expect(matchUp.score.scoreStringSide2).not.toBe('6-1 4-6 [1-4](0-0) RET');

    // derived strictly from the surviving sets
    expect(matchUp.score.scoreStringSide1).toBe('1-6 6-4');
    expect(matchUp.score.scoreStringSide2).toBe('6-1 4-6');

    // the outcome token is never baked into a stored string — matchUpStatus already carries it
    expect(matchUp.score.scoreStringSide1).not.toContain('RET');
    expect(matchUp.matchUpStatus).toBe(RETIRED);

    // the point score never leaks into the string
    expect(matchUp.score.scoreStringSide1).not.toContain('(0-0)');
  });

  test('deciding tiebreak set renders bracketed using the matchUp format when outcome omits it', () => {
    seedMatchUp(TB10_FORMAT);

    // The deciding set carries game scores rather than tiebreak scores; only the matchUpFormat
    // reveals that set 3 is a tiebreak-only set. The outcome deliberately omits matchUpFormat so
    // the format must be resolved from the matchUp/draw.
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: MATCHUP_ID,
      drawId: DRAW_ID,
      outcome: {
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
            { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
            { setNumber: 3, side1Score: 10, side2Score: 8, winningSide: 1 },
          ],
        },
      },
    });
    expect(result.success).toBe(true);

    const matchUp = getMatchUp();
    expect(matchUp.score.scoreStringSide1).toBe('6-4 3-6 [10-8]');
    expect(matchUp.score.scoreStringSide2).toBe('4-6 6-3 [8-10]');
  });

  test('empty sets are filtered before generation so sets and strings agree', () => {
    seedMatchUp(TB10_FORMAT);

    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: MATCHUP_ID,
      drawId: DRAW_ID,
      outcome: {
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 3, side1Score: 0, side2Score: 0 },
          ],
        },
      },
    });
    expect(result.success).toBe(true);

    const matchUp = getMatchUp();
    // the empty deciding set is dropped from sets — and must not survive in the string either
    expect(matchUp.score.sets.length).toBe(2);
    expect(matchUp.score.scoreStringSide1).toBe('6-1 6-2');
    expect(matchUp.score.scoreStringSide1).not.toContain('0-0');
  });

  test('non-derived score attributes survive regeneration', () => {
    seedMatchUp(TB10_FORMAT);

    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: MATCHUP_ID,
      drawId: DRAW_ID,
      outcome: {
        matchUpStatus: 'IN_PROGRESS',
        score: {
          sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }],
          side1PointScore: '30',
          side2PointScore: '15',
          scoreStringSide1: 'bogus caller string',
        },
      },
    });
    expect(result.success).toBe(true);

    const matchUp = getMatchUp();
    expect(matchUp.score.scoreStringSide1).toBe('3-2');
    expect(matchUp.score.side1PointScore).toBe('30');
    expect(matchUp.score.side2PointScore).toBe('15');
  });
});
