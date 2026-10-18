import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { tournamentEngine } from '@Engines/syncEngine';
import { mocksEngine } from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/**
 * A completed aggregate or outs result is a validated winning score (2026-10-17).
 *
 * Two checks refused every such result, so `validMatchUpOutcome` was false for it:
 * - `analyzeSet` had no outs branch: an inning was judged as a standard set, which requires `setTo`,
 *   and an outs format has none — so no completed inning was ever a valid set outcome;
 * - `analyzeMatchUp` asked the winner to have won MORE SETS even for an aggregate format, which its
 *   own aggregate branch says is not the question (an aggregate is routinely won on fewer segments).
 *
 * Found while hardening mocksEngine (assessment M4): 30 of 30 generated `INN4XA-S:O3-M:T50` outcomes
 * were "invalid", and so were the scoring engine's own innings results. In production the revert
 * guard and the outcome pipeline's view ask `validMatchUpOutcome`, so a completed BLW or INTENNSE
 * match could be reverted to a live status without the refusal every other format gets.
 */

const OUTS = 'INN4XA-S:O3-M:T50';
const inning = (setNumber: number, side1Score: number, side2Score: number) => ({
  winningSide: (side1Score > side2Score && 1) || (side2Score > side1Score && 2) || undefined,
  side1Score,
  side2Score,
  setNumber,
});

// side 1 wins the aggregate 25-24 having won ONE inning to side 2's two; the first inning is level
const ONE_RUN_WIN = [inning(1, 9, 9), inning(2, 6, 7), inning(3, 9, 4), inning(4, 1, 4)];

const analyze = (sets: any[], winningSide: number, matchUpFormat: string) =>
  analyzeMatchUp({ matchUp: { score: { sets }, winningSide, matchUpFormat }, matchUpFormat });

describe('outs (innings)', () => {
  it('a result won on the aggregate with fewer innings, with a level inning, is valid', () => {
    const analysis: any = analyze(ONE_RUN_WIN, 1, OUTS);
    expect(analysis.calculatedWinningSide).toEqual(1);
    expect(analysis.completedSetsHaveValidOutcomes).toEqual(true);
    expect(analysis.validMatchUpWinningSide).toEqual(true);
    expect(analysis.validMatchUpOutcome).toEqual(true);
  });

  it('a textbook result is valid', () => {
    const sets = [inning(1, 3, 1), inning(2, 2, 0), inning(3, 0, 1), inning(4, 1, 0)];
    expect((analyze(sets, 1, OUTS) as any).validMatchUpOutcome).toEqual(true);
  });

  it('control: the wrong match winner is still refused', () => {
    const analysis: any = analyze(ONE_RUN_WIN, 2, OUTS);
    expect(analysis.validMatchUpWinningSide).toEqual(false);
    expect(analysis.validMatchUpOutcome).toBeFalsy();
  });

  it('control: an inning credited to the lower total is still refused', () => {
    const sets = [inning(1, 3, 1), { ...inning(2, 2, 0), winningSide: 2 }, inning(3, 0, 1), inning(4, 1, 0)];
    const analysis: any = analyze(sets, 1, OUTS);
    expect(analysis.completedSetsHaveValidOutcomes).toEqual(false);
    expect(analysis.validMatchUpOutcome).toBeFalsy();
  });

  it('control: a level inning given a winner is refused', () => {
    const sets = [{ ...inning(1, 2, 2), winningSide: 1 }, inning(2, 2, 0), inning(3, 0, 1), inning(4, 1, 0)];
    expect((analyze(sets, 1, OUTS) as any).completedSetsHaveValidOutcomes).toEqual(false);
  });
});

describe('timed aggregate (INTENNSE)', () => {
  const FORMAT = 'SET3XA-S:T10';
  const bolt = (setNumber: number, side1Score: number, side2Score: number) => ({
    winningSide: side1Score > side2Score ? 1 : 2,
    side1Score,
    side2Score,
    setNumber,
  });

  it('side 2 wins on points with one bolt of three', () => {
    const sets = [bolt(1, 21, 20), bolt(2, 22, 21), bolt(3, 5, 30)];
    const analysis: any = analyze(sets, 2, FORMAT);
    expect(analysis.calculatedWinningSide).toEqual(2);
    expect(analysis.validMatchUpOutcome).toEqual(true);
  });

  it('control: the side with more bolts but fewer points is not the winner', () => {
    const sets = [bolt(1, 21, 20), bolt(2, 22, 21), bolt(3, 5, 30)];
    expect((analyze(sets, 1, FORMAT) as any).validMatchUpOutcome).toBeFalsy();
  });
});

describe('the revert guard now protects these results', () => {
  it('a COMPLETED outs matchUp with a validated score is not reverted to IN_PROGRESS', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'blw', drawSize: 4, idPrefix: 'm', matchUpFormat: OUTS }],
      setState: true,
    });
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { score: { sets: ONE_RUN_WIN }, winningSide: 1, matchUpStatus: COMPLETED },
      matchUpId: 'm-1-1',
      drawId: 'blw',
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: IN_PROGRESS },
      matchUpId: 'm-1-1',
      drawId: 'blw',
    });
    expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
    const { matchUp }: any = tournamentEngine.findMatchUp({ matchUpId: 'm-1-1' });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
  });
});
