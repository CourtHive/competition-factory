import { validateScore } from '@Validators/validateScore';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS, RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';

/**
 * A COMPLETED score must be complete.
 *
 * The write path asked only whether a set EXCEEDED the format, never whether it was FINISHED, so under
 * `SET3-S:6/TB7` the engine recorded `3-7 6-4 6-4` and `4-2 2-6 2-6` as COMPLETED (measured 2026-10-01).
 * CA: "accepting 3-7 6-4 6-4 for a standard SET3-S:6/TB7 is unacceptable behavior!" Ruled a fix to
 * validation; `disableScoreValidation` is the opt-out. See `scoreCompleteness`.
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';

type SetTuple = [number, number] | [number, number, number, number];
const toSets = (tuples: SetTuple[], winners: (number | undefined)[]) =>
  tuples.map(([s1, s2, t1, t2], index) => ({
    setNumber: index + 1,
    side1Score: s1,
    side2Score: s2,
    ...(t1 !== undefined && { side1TiebreakScore: t1, side2TiebreakScore: t2 }),
    ...(winners[index] && { winningSide: winners[index] }),
  }));
const decider = (t1: number, t2: number, winningSide?: number) => ({
  setNumber: 3,
  side1TiebreakScore: t1,
  side2TiebreakScore: t2,
  ...(winningSide && { winningSide }),
});

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
  const first = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));
  return { drawId, matchUpId: first.matchUpId };
}

const record = (outcome: any, extra: any = {}) => {
  const { drawId, matchUpId } = setUp();
  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, ...extra });
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  return { result, matchUp };
};

describe('a COMPLETED score is refused when a set could not have finished', () => {
  it('3-7 6-4 6-4: a 7-3 set does not exist under a tiebreak at six — refused, naming set 1', () => {
    const sets = toSets(
      [
        [3, 7],
        [6, 4],
        [6, 4],
      ],
      [2, 1, 1],
    );
    const { result, matchUp } = record({ score: { sets }, winningSide: 1, matchUpStatus: COMPLETED });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toMatch(/^Set 1: /);
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUp.winningSide).toBeUndefined();
  });

  it('4-2 2-6 2-6: a first set at 4-2 has not finished — refused, naming set 1', () => {
    const sets = toSets(
      [
        [4, 2],
        [2, 6],
        [2, 6],
      ],
      [undefined, 2, 2],
    );
    const { result } = record({ score: { sets }, winningSide: 2, matchUpStatus: COMPLETED });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toMatch(/^Set 1: /);
  });

  it('6-3 1-6 [3-4]: a match tiebreak at 3-4 has not finished, though a winner is named — refused', () => {
    const sets = [
      ...toSets(
        [
          [6, 3],
          [1, 6],
        ],
        [1, 2],
      ),
      decider(3, 4, 2),
    ];
    const { result } = record({ score: { sets }, winningSide: 2, matchUpStatus: COMPLETED });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toMatch(/^Set 3: /);
  });

  it('a winningSide with no status claims completion just as COMPLETED does', () => {
    const sets = toSets(
      [
        [3, 7],
        [6, 4],
        [6, 4],
      ],
      [2, 1, 1],
    );
    const { result } = record({ score: { sets }, winningSide: 1 });
    expect(result.error).toEqual(INVALID_SCORE);
  });
});

describe('finished scores are recorded as before', () => {
  it('6-3 6-4, 7-6(5) 6-7(3) [10-8] and 7-5 6-4 are all COMPLETED', () => {
    const cases = [
      {
        sets: toSets(
          [
            [6, 3],
            [6, 4],
          ],
          [1, 1],
        ),
        winningSide: 1,
      },
      {
        sets: [
          ...toSets(
            [
              [7, 6, 7, 5],
              [6, 7, 3, 7],
            ],
            [1, 2],
          ),
          decider(10, 8, 1),
        ],
        winningSide: 1,
      },
      {
        sets: toSets(
          [
            [7, 5],
            [6, 4],
          ],
          [1, 1],
        ),
        winningSide: 1,
      },
    ];
    for (const { sets, winningSide } of cases) {
      const { result, matchUp } = record({ score: { sets }, winningSide, matchUpStatus: COMPLETED });
      expect(result.success, JSON.stringify(sets)).toBe(true);
      expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    }
  });
});

describe('an irregular or live score may leave only its LAST set unfinished', () => {
  it('RETIRED at 6-4 3-2 is recorded; RETIRED at 4-2 6-3 1-0 is refused, naming set 1', () => {
    let { result } = record({
      score: {
        sets: toSets(
          [
            [6, 4],
            [3, 2],
          ],
          [1],
        ),
      },
      winningSide: 1,
      matchUpStatus: RETIRED,
    });
    expect(result.success).toBe(true);

    ({ result } = record({
      score: {
        sets: toSets(
          [
            [4, 2],
            [6, 3],
            [1, 0],
          ],
          [undefined, 1],
        ),
      },
      winningSide: 1,
      matchUpStatus: RETIRED,
    }));
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toMatch(/^Set 1: /);
  });

  it('IN_PROGRESS at 6-4 3-2 is recorded; IN_PROGRESS at 4-2 3-2 is refused, naming set 1', () => {
    let { result } = record({
      score: {
        sets: toSets(
          [
            [6, 4],
            [3, 2],
          ],
          [1],
        ),
      },
      matchUpStatus: IN_PROGRESS,
    });
    expect(result.success).toBe(true);

    ({ result } = record({
      score: {
        sets: toSets(
          [
            [4, 2],
            [3, 2],
          ],
          [],
        ),
      },
      matchUpStatus: IN_PROGRESS,
    }));
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toMatch(/^Set 1: /);
  });

  it('RETIRED at 6-3 2-1 as parseScoreString builds it — set 2 "won" by the side ahead — is recorded', () => {
    const sets = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-3 2-1', winningSide: 1 }).outcome.score
      .sets;
    expect(sets[1].winningSide, 'the parser stamps the leader').toEqual(1);
    const { result, matchUp } = record({ score: { sets }, winningSide: 1, matchUpStatus: RETIRED });
    expect(result.success).toBe(true);
    expect(matchUp.matchUpStatus).toEqual(RETIRED);
  });

  // the bounds check refuses this before completeness is asked; pinned so a looser last set cannot creep in
  it('an unfinished last set is still refused past the ceiling: IN_PROGRESS at 6-4 9-4', () => {
    const { result } = record({
      score: {
        sets: toSets(
          [
            [6, 4],
            [9, 4],
          ],
          [1],
        ),
      },
      matchUpStatus: IN_PROGRESS,
    });
    expect(result.error).toEqual(INVALID_SCORE);
  });
});

describe('the opt-out, and where the rule has no opinion', () => {
  it('disableScoreValidation records 3-7 6-4 6-4 as COMPLETED', () => {
    const sets = toSets(
      [
        [3, 7],
        [6, 4],
        [6, 4],
      ],
      [2, 1, 1],
    );
    const { result, matchUp } = record(
      { score: { sets }, winningSide: 1, matchUpStatus: COMPLETED },
      { disableScoreValidation: true },
    );
    expect(result.success).toBe(true);
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });

  it('a score with no format is not checked for completeness', () => {
    const sets = toSets(
      [
        [3, 7],
        [6, 4],
        [6, 4],
      ],
      [2, 1, 1],
    );
    expect(validateScore({ score: { sets }, winningSide: 1, matchUpStatus: COMPLETED }).valid).toBe(true);
    expect(
      validateScore({ score: { sets }, winningSide: 1, matchUpStatus: COMPLETED, matchUpFormat: FORMAT }).error,
    ).toEqual(INVALID_SCORE);
  });
});
