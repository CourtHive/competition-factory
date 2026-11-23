import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { ABANDONED, COMPLETED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * A combined-point total that allows a tie (`SET1-S:P32`) can end 16–16: COMPLETED, with no winningSide
 * (CA, 2026-10-11: ties are valid). `readyToScore` meant "has two participants and no winner", so the
 * finished tie read as ready to score and consumers offered to score it again. A completed tie is
 * finished; the same predicate the round-robin tally uses (`isCompletedCombinedPointTie`) now decides it.
 */

const POINTS_32 = 'SET1-S:P32';

function scoreFirstMatchUp(side1Score: number, side2Score: number, winningSide?: number) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const target = matchUps.find((matchUp: any) => matchUp.readyToScore);
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    drawId: target.drawId,
    outcome: {
      matchUpStatus: COMPLETED,
      winningSide,
      score: { sets: [{ setNumber: 1, side1Score, side2Score, winningSide }] },
    },
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.findMatchUp({ matchUpId: target.matchUpId, inContext: true });
  return result.matchUp;
}

function generate(matchUpFormat = POINTS_32) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4, matchUpFormat }],
    setState: true,
    nonRandom: 1,
  });
}

describe('a completed combined-point tie is not ready to score', () => {
  it('16–16 COMPLETED with no winner is finished', () => {
    generate();
    const matchUp = scoreFirstMatchUp(16, 16);
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toBeUndefined();
    expect(matchUp.readyToScore).toEqual(false);
  });

  it('control: a won combined-point result is not ready to score, and an unscored one is', () => {
    generate();
    const won = scoreFirstMatchUp(17, 15, 1);
    expect(won.readyToScore).toEqual(false);
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const unscored = matchUps.filter((matchUp: any) => !matchUp.score?.sets?.length);
    expect(unscored.length).toBeGreaterThan(0);
    expect(unscored.every((matchUp: any) => matchUp.readyToScore)).toEqual(true);
  });

  it('control: an ABANDONED matchUp keeps readyToScore, as it always has', () => {
    generate();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const target = matchUps.find((matchUp: any) => matchUp.readyToScore);
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      outcome: { matchUpStatus: ABANDONED },
    });
    expect(result.success).toEqual(true);
    const { matchUp } = tournamentEngine.findMatchUp({ matchUpId: target.matchUpId, inContext: true });
    expect(matchUp.matchUpStatus).toEqual(ABANDONED);
    expect(matchUp.readyToScore).toEqual(true);
  });
});
