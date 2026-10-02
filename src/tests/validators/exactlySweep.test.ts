import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';

/**
 * An `exactly` format plays every set, so a sweep is a win.
 *
 * The engine required the winner's set count to EQUAL `setsToWin`, which is right for a best-of (it stops
 * there) and wrong for `exactly`, whose winner routinely passes it. A 3-0 sweep of `SET3X-S:T10` was
 * refused while `analyzeMatchUp` named side 1 (validator debate V9, re-measured 2026-10-02).
 */
const bolt = (s1: number, s2: number, setNumber: number) => ({
  setNumber,
  side1Score: s1,
  side2Score: s2,
  winningSide: s1 > s2 ? 1 : 2,
});

function record(matchUpFormat: string, sets: any[], winningSide: number) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, matchUpFormat }],
    completeAllMatchUps: false,
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const { matchUpId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  const result: any = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome: { score: { sets }, winningSide, matchUpStatus: COMPLETED },
  });
  return { result, matchUp: tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp };
}

describe('an exactly format records its winner however many sets they took', () => {
  it('a 3-0 sweep of SET3X-S:T10 is recorded, as analyzeMatchUp already said', () => {
    const sets = [1, 2, 3].map((n) => bolt(10, 5, n));
    const { result, matchUp } = record('SET3X-S:T10', sets, 1);
    expect(result.success).toBe(true);
    expect(matchUp.winningSide).toEqual(1);
    expect(
      analyzeMatchUp({ matchUp: { matchUpFormat: 'SET3X-S:T10', winningSide: 1, score: { sets } } })
        .calculatedWinningSide,
    ).toEqual(1);
  });

  it('3-1 in SET4X-S:T10 is a win; 2-2 has no winner, so naming one is refused', () => {
    const threeOne = [bolt(10, 5, 1), bolt(10, 5, 2), bolt(5, 10, 3), bolt(10, 5, 4)];
    expect(record('SET4X-S:T10', threeOne, 1).result.success).toBe(true);

    const level = [bolt(10, 5, 1), bolt(5, 10, 2), bolt(10, 5, 3), bolt(5, 10, 4)];
    const { result, matchUp } = record('SET4X-S:T10', level, 1);
    expect(result.error).toEqual(INVALID_SCORE);
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  });

  it('a best-of is untouched: a winner past setsToWin is still refused', () => {
    // three sets won under SET3 means a set was played after the match was decided
    const sets = [1, 2, 3].map((n) => ({ ...bolt(6, 4, n) }));
    expect(record('SET3-S:6/TB7', sets, 1).result.error).toEqual(INVALID_SCORE);
  });
});
