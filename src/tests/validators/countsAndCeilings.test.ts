import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { validateScore } from '@Validators/validateScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';

/**
 * Validator debate group 5, re-measured on dev 2026-10-02. V6 and V8 were already closed by #5088 and
 * #5096; these are the two that were not.
 *
 * X2 — the set count was never compared to the format: five sets validated under `SET3`, and the engine
 * recorded `6-4 6-4 4-6`, a third set played after a 2-0 win.
 * V7 — the analysis had no tiebreak ceiling: `7-6(10-8)` under `TB7NOAD` and `7-6(10-7)` under `TB7` were
 * complete, valid sets to `checkSetIsComplete` and `analyzeSet` while both validators refused them.
 */
const SET3 = 'SET3-S:6/TB7';
const set = (s1: number, s2: number, setNumber: number, tiebreak?: [number, number]) => ({
  setNumber,
  side1Score: s1,
  side2Score: s2,
  winningSide: s1 > s2 ? 1 : 2,
  ...(tiebreak && { side1TiebreakScore: tiebreak[0], side2TiebreakScore: tiebreak[1] }),
});

describe('X2: no set after a best-of match is decided', () => {
  const afterTwoNil = [set(6, 4, 1), set(6, 4, 2), set(4, 6, 3)];
  const fiveSets = [set(6, 4, 1), set(4, 6, 2), set(6, 4, 3), set(4, 6, 4), set(6, 4, 5)];

  it('the engine refuses 6-4 6-4 4-6, naming set 3, and records nothing', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, matchUpFormat: SET3 }],
      completeAllMatchUps: false,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const { matchUpId } = matchUps.find((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));

    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: afterTwoNil }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.error).toEqual(INVALID_SCORE);
    expect(result.info).toEqual('Set 3: played after the match was decided');
    expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

    // the control: the same match stopped at 2-0 is recorded
    result = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId,
      outcome: { score: { sets: afterTwoNil.slice(0, 2) }, winningSide: 1, matchUpStatus: COMPLETED },
    });
    expect(result.success).toBe(true);
  });

  it('validateMatchUpScore refuses five sets under SET3 and a set after 2-0; 2-1 is valid', () => {
    expect(validateMatchUpScore(fiveSets, SET3, COMPLETED)).toEqual({
      isValid: false,
      error: 'Set 4: a best of 3 plays at most 3 sets',
    });
    expect(validateMatchUpScore(afterTwoNil, SET3, COMPLETED).error).toEqual(
      'Set 3: played after the match was decided',
    );
    expect(validateMatchUpScore([set(6, 4, 1), set(4, 6, 2), set(6, 4, 3)], SET3, COMPLETED).isValid).toBe(true);
  });

  it('an exactly format plays every set whatever the score, so a 3-0 sweep stands', () => {
    const timed = [1, 2, 3].map((n) => set(10, 5, n));
    expect(validateMatchUpScore(timed, 'SET3X-S:T10', COMPLETED).isValid).toBe(true);
  });
});

describe('V7: a tiebreak is never won past its margin, in the analysis as in the validators', () => {
  it('7-6(10-8) under TB7NOAD: a no-ad tiebreak ends at seven, so every answerer refuses it', () => {
    const format = 'SET3-S:6/TB7NOAD';
    const scoring = parse(format);
    const overshot = set(7, 6, 1, [10, 8]);
    expect(checkSetIsComplete({ set: overshot, matchUpScoringFormat: scoring })).toBe(false);
    expect(analyzeSet({ setObject: overshot, matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(false);
    expect(validateSetScore(overshot, format, false, false).isValid).toBe(false);

    // the control: 7-6(7-6) is a no-ad tiebreak won at the target by one
    const won = set(7, 6, 1, [7, 6]);
    expect(checkSetIsComplete({ set: won, matchUpScoringFormat: scoring })).toBe(true);
    expect(analyzeSet({ setObject: won, matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(true);
  });

  it('7-6(10-7) under TB7: past the target only by exactly two, so 10-8 stands and 10-7 does not', () => {
    const scoring = parse(SET3);
    expect(checkSetIsComplete({ set: set(7, 6, 1, [10, 7]), matchUpScoringFormat: scoring })).toBe(false);
    expect(analyzeSet({ setObject: set(7, 6, 1, [10, 7]), matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(
      false,
    );
    expect(checkSetIsComplete({ set: set(7, 6, 1, [10, 8]), matchUpScoringFormat: scoring })).toBe(true);
    expect(analyzeSet({ setObject: set(7, 6, 1, [10, 8]), matchUpScoringFormat: scoring }).isValidSetOutcome).toBe(
      true,
    );
  });

  it('a TB1 decider is won 1-0 by every answerer: the margin is capped at the target', () => {
    const format = 'SET3XA-S:T10-F:TB1';
    // the decider is set 4: the sudden death after three level bolts, never one of them (CA, 2026-10-04)
    const decider = { setNumber: 4, side1TiebreakScore: 1, side2TiebreakScore: 0, winningSide: 1 };
    expect(analyzeSet({ setObject: decider, matchUpScoringFormat: parse(format) }).isValidSetOutcome).toBe(true);
    const levelBolt = { setNumber: 3, side1Score: 20, side2Score: 20 };
    const sets = [set(30, 25, 1), set(25, 30, 2), levelBolt, decider];
    expect(
      validateScore({ score: { sets }, winningSide: 1, matchUpStatus: COMPLETED, matchUpFormat: format }).valid,
    ).toBe(true);
  });
});
