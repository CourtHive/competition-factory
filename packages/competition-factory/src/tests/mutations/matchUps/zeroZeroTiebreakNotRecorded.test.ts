import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { TIEBREAK_POINTS_NOT_RECORDED } from '@Constants/scoreWarningConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';

/**
 * CA, 2026-11-04: 0-0 tiebreak points on a set whose games are not level are not recorded points. Prod that day: an
 * integration sent `3-6 6-7` with `side1TiebreakScore: 0, side2TiebreakScore: 0` on the second set and was refused
 * ("Tiebreak winner must reach 7 points, got 0"). No tiebreak finishes 0-0, so the pair is the feed's empty default.
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';
const first = { setNumber: 1, side1Score: 3, side2Score: 6, winningSide: 2 };
const zeroZero = {
  setNumber: 2,
  side1Score: 6,
  side2Score: 7,
  winningSide: 2,
  side1TiebreakScore: 0,
  side2TiebreakScore: 0,
};

function setUp() {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, matchUpFormat: FORMAT }],
    completeAllMatchUps: false,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const { matchUpId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  return { drawId, matchUpId };
}

const stored = (drawId: string, matchUpId: string) => tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;

describe('0-0 tiebreak points on a decided set are not recorded', () => {
  it('the prod score is recorded as a bare 7-6, with the not-recorded warning', () => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [first, zeroZero] }, winningSide: 2, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
    expect(result.warnings).toContainEqual({ code: TIEBREAK_POINTS_NOT_RECORDED, setNumbers: [2] });

    const matchUp = stored(drawId, matchUpId);
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toEqual(2);
    expect(matchUp.score.sets[1].side1TiebreakScore).toBeUndefined();
    expect(matchUp.score.sets[1].side2TiebreakScore).toBeUndefined();
    expect(matchUp.score.scoreStringSide1).toBe('3-6 6-7');
    expect(matchUp.score.scoreStringSide2).toBe('6-3 7-6');
  });

  it('string zeros, as a feed may send them, are the same empty default', () => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: {
        score: { sets: [first, { ...zeroZero, side1TiebreakScore: '0', side2TiebreakScore: '0' }] },
        matchUpStatus: COMPLETED,
        winningSide: 2,
      },
    });
    expect(result.success).toBe(true);
    expect(stored(drawId, matchUpId).score.sets[1].side1TiebreakScore).toBeUndefined();
  });

  it('real tiebreak points are kept', () => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: {
        score: { sets: [first, { ...zeroZero, side1TiebreakScore: 5, side2TiebreakScore: 7 }] },
        matchUpStatus: COMPLETED,
        winningSide: 2,
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings ?? []).not.toContainEqual(expect.objectContaining({ code: TIEBREAK_POINTS_NOT_RECORDED }));
    const set = stored(drawId, matchUpId).score.sets[1];
    expect([set.side1TiebreakScore, set.side2TiebreakScore]).toEqual([5, 7]);
  });

  it('impossible tiebreak points other than 0-0 are still refused', () => {
    const { drawId, matchUpId } = setUp();
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: {
        score: { sets: [first, { ...zeroZero, side1TiebreakScore: 0, side2TiebreakScore: 3 }] },
        matchUpStatus: COMPLETED,
        winningSide: 2,
      },
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(stored(drawId, matchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  it('at 6-6 in progress, 0-0 points are no points too: recorded as 6-6, where they used to be refused', () => {
    const { drawId, matchUpId } = setUp();
    const begun = { setNumber: 2, side1Score: 6, side2Score: 6, side1TiebreakScore: 0, side2TiebreakScore: 0 };
    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: [first, begun] }, matchUpStatus: IN_PROGRESS },
    });
    expect(result.success).toBe(true);
    const matchUp = stored(drawId, matchUpId);
    expect(matchUp.matchUpStatus).toEqual(IN_PROGRESS);
    expect([matchUp.score.sets[1].side1Score, matchUp.score.sets[1].side2Score]).toEqual([6, 6]);
    expect(matchUp.score.sets[1].side1TiebreakScore).toBeUndefined();
  });
});
