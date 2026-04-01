/**
 * Coverage tests for analyzeSet refactoring.
 * Targets uncovered branches: deciding set format, timed sets,
 * tiebreak set detection, leading side determination, and validation helpers.
 */
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { expect, it, describe } from 'vitest';

import { MISSING_SET_OBJECT } from '@Constants/errorConditionConstants';

describe('analyzeSet coverage', () => {
  it('returns error when setObject is missing', () => {
    let result: any = analyzeSet({ matchUpScoringFormat: {} });
    expect(result.error).toEqual(MISSING_SET_OBJECT);
  });

  it('handles deciding set with finalSetFormat', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 3,
        side1Score: 7,
        side2Score: 5,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
        finalSetFormat: { setTo: 6, NoAD: true },
      },
    });
    expect(result.isDecidingSet).toEqual(true);
    expect(result.setFormat).toEqual({ setTo: 6, NoAD: true });
  });

  it('handles timed set format', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 4,
        side2Score: 2,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 1,
        setFormat: { timed: true },
      },
    });
    expect(result.expectTimedSet).toEqual(true);
    expect(result.isValidSetOutcome).toEqual(true);
  });

  it('correctly detects leading side in tiebreak condition', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      },
    });
    expect(result.hasTiebreakCondition).toBeTruthy();
    expect(result.leadingSide).toEqual(1);
  });

  it('returns undefined leading side when game scores are equal at tiebreak', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 6,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      },
    });
    expect(result.hasTiebreakCondition).toBeTruthy();
    expect(result.leadingSide).toBeUndefined();
  });

  it('identifies tiebreak set correctly', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1TiebreakScore: 10,
        side2TiebreakScore: 8,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 1,
        setFormat: { tiebreakSet: { tiebreakTo: 10 } },
      },
    });
    expect(result.isTiebreakSet).toEqual(true);
    expect(result.expectTiebreakSet).toEqual(true);
    expect(result.isValidSet).toEqual(true);
  });

  it('invalidates set when expecting tiebreak but receiving standard', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 1,
        setFormat: { tiebreakSet: { tiebreakTo: 10 } },
      },
    });
    expect(result.isValidSet).toEqual(false);
  });

  it('invalidates set when expecting standard but receiving tiebreak', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1TiebreakScore: 10,
        side2TiebreakScore: 8,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      },
    });
    expect(result.isValidSet).toEqual(false);
  });

  it('handles setNumber exceeding maxSetNumber', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 4,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6 },
      },
    });
    expect(result.isValidSetNumber).toEqual(false);
    expect(result.isValidSet).toEqual(false);
  });

  it('handles NoAD standard set with minimum win margin of 1', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 6,
        side2Score: 5,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, NoAD: true },
      },
    });
    expect(result.isValidSet).toEqual(true);
    expect(result.isValidStandardSetOutcome).toEqual(true);
  });

  it('validates winning game scoreString (4) - difference too large above setTo', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 9,
        side2Score: 3,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, NoAD: true },
      },
    });
    expect(result.isValidStandardSetOutcome).toEqual(false);
  });

  it('handles exactly format (not bestOf)', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        exactly: 1,
        setFormat: { setTo: 6 },
      },
    });
    expect(result.isDecidingSet).toEqual(true);
    expect(result.isValidSetNumber).toEqual(true);
  });

  it('handles tiebreakAt lower than setTo', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 5,
        side2Score: 5,
        side1TiebreakScore: 7,
        side2TiebreakScore: 3,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6, tiebreakAt: 5, tiebreakFormat: { tiebreakTo: 7 } },
      },
    });
    expect(result.hasTiebreakCondition).toBeTruthy();
  });

  it('covers point scores count', () => {
    let result: any = analyzeSet({
      setObject: {
        setNumber: 1,
        side1Score: 6,
        side2Score: 4,
        side1PointScore: 48,
        side2PointScore: 32,
        winningSide: 1,
      },
      matchUpScoringFormat: {
        bestOf: 3,
        setFormat: { setTo: 6 },
      },
    });
    expect(result.sidePointScoresCount).toEqual(2);
    expect(result.sidePointScores).toEqual([48, 32]);
  });
});
