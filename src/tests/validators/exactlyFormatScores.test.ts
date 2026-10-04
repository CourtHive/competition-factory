import { validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { analyzeScore } from '@Query/matchUp/analyzeScore';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * `SET3X-S:T10` plays EXACTLY three ten-minute sets, and the side ahead when time runs out takes each.
 *
 * Two scores the format cannot produce were accepted by every layer — `analyzeScore`, the score-entry
 * dialog's `validateMatchUpScore`, and the engine's write (measured 2026-10-04):
 * - a FOURTH set: the count was checked only from below (`sets.length >= exactly`)
 * - a set won by the side BEHIND in it: a timed set has no `setTo`, so no set check read its score
 * And a TWO-set match passed the dialog while the engine refused it.
 *
 * Each row asks all three layers, so a fix to one cannot hide behind another.
 */
const FORMAT = 'SET3X-S:T10';

type Row = [number, number, (1 | 2)?];
const sets = (rows: Row[]) =>
  rows.map(([side1Score, side2Score, winningSide], index) => ({
    setNumber: index + 1,
    side1Score,
    side2Score,
    winningSide,
  }));

function engineRecords(score: { sets: any[] }, winningSide: number) {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4, matchUpFormat: FORMAT }], setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { matchUpId, drawId } = matchUps[0];
  return tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide, score },
    matchUpId,
    drawId,
  });
}

function layers(rows: Row[], winningSide: 1 | 2) {
  const score = { sets: sets(rows) };
  return {
    analyzeScore: analyzeScore({ matchUpFormat: FORMAT, matchUpStatus: COMPLETED, winningSide, score }).valid,
    validateMatchUpScore: validateMatchUpScore(score.sets, FORMAT, COMPLETED).isValid,
    engine: engineRecords(score, winningSide),
  };
}

describe('SET3X-S:T10, recorded COMPLETED', () => {
  it('accepts three sets, side 1 taking two', () => {
    const result = layers(
      [
        [10, 11, 2],
        [11, 10, 1],
        [10, 8, 1],
      ],
      1,
    );
    expect(result.analyzeScore).toEqual(true);
    expect(result.validateMatchUpScore).toEqual(true);
    expect(result.engine.success).toEqual(true);
  });

  it('refuses a fourth set', () => {
    const result = layers(
      [
        [11, 10, 1],
        [10, 8, 1],
        [8, 10, 2],
        [9, 5, 1],
      ],
      1,
    );
    expect(result.analyzeScore).toEqual(false);
    expect(result.validateMatchUpScore).toEqual(false);
    expect(result.engine.error).toEqual(INVALID_SCORE);
  });

  it('refuses a set won by the side behind in it', () => {
    // set 1 is 10-11 but names side 1: side 1 would hold all three sets
    const result = layers(
      [
        [10, 11, 1],
        [11, 10, 1],
        [10, 8, 1],
      ],
      1,
    );
    expect(result.analyzeScore).toEqual(false);
    expect(result.validateMatchUpScore).toEqual(false);
    expect(result.engine.error).toEqual(INVALID_SCORE);
  });

  it('refuses two sets', () => {
    const result = layers(
      [
        [11, 10, 1],
        [10, 8, 1],
      ],
      1,
    );
    expect(result.analyzeScore).toEqual(false);
    expect(result.validateMatchUpScore).toEqual(false);
    expect(result.engine.error).toEqual(INVALID_SCORE);
  });

  it('refuses the wrong match winner', () => {
    expect(
      analyzeScore({
        score: {
          sets: sets([
            [10, 11, 2],
            [11, 10, 1],
            [10, 8, 1],
          ]),
        },
        matchUpStatus: COMPLETED,
        matchUpFormat: FORMAT,
        winningSide: 2,
      }).valid,
    ).toEqual(false);
  });
});

/**
 * CA, 2026-10-04: `-F:TB1` is a sudden-death tiebreak, and it occurs only where the match is decided by
 * AGGREGATE points; in INTENNSE it is not one of the N sets. So an aggregate `exactly` format records at
 * most N + 1 sets, and one decided by sets records N.
 */
describe('the most sets an exactly format records', () => {
  const timed = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({ setNumber: index + 1, side1Score: 30, side2Score: 25 }));

  it.each([
    ['SET3XA-S:T10-F:TB1', 4, true],
    ['SET3XA-S:T10-F:TB1', 5, false],
    ['SET3XA-S:T10', 4, true],
    ['SET2XA-S:T10-F:TB1', 3, true],
    ['SET3X-S:T10', 4, false],
    ['SET3X-S:T10P/TB1', 4, false],
  ])('%s with %i sets: within the cap %s', (matchUpFormat, count, withinCap) => {
    const isValid = validateMatchUpScore(timed(count), matchUpFormat).isValid;
    expect(isValid).toEqual(withinCap);
  });
});
