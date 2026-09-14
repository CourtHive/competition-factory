import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { expect, test } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  INVALID_GAME_SCORES,
  INVALID_VALUES,
  INVALID_WINNING_SIDE,
  MISSING_SET_OBJECT,
} from '@Constants/errorConditionConstants';

test('can properly analyze standard advantage sets with tiebreak', () => {
  const matchUpFormat = FORMAT_STANDARD;
  const matchUpScoringFormat = parse(matchUpFormat);

  let analysis = analyzeSet({ matchUpScoringFormat });
  let { error, isValidSetOutcome } = analysis;
  expect(error).toEqual(MISSING_SET_OBJECT);
  expect(isValidSetOutcome).toEqual(undefined);
  expect(analysis.isValidSet).toEqual(undefined);

  let setObject: any = { setNumber: 1, side1Score: 6, side2Score: 3 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ isValidSetOutcome } = analysis);
  expect(analysis.isValidSet).toEqual(true);
  expect(isValidSetOutcome).toEqual(false);

  setObject = { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ isValidSetOutcome } = analysis);
  expect(analysis.isValidSet).toEqual(true);
  expect(isValidSetOutcome).toEqual(true);

  setObject = { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(analysis.isValidSet).toEqual(false);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.code).toEqual(INVALID_VALUES.code);

  setObject = { setNumber: 1, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error).toEqual(INVALID_GAME_SCORES);

  setObject = { setNumber: 1, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error).toEqual(INVALID_GAME_SCORES);

  setObject = { setNumber: 1, side1Score: 5, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error).toEqual(INVALID_GAME_SCORES);

  setObject = { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 0 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error).toEqual(INVALID_WINNING_SIDE);

  setObject = { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 3 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error).toEqual(INVALID_WINNING_SIDE);

  setObject = { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 2 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('winningSide game scoreString is not high');

  setObject = { setNumber: 1, side1Score: 7, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('invalid winning game scoreString (2)');

  setObject = { setNumber: 1, side1Score: 8, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('invalid winning game scoreString (2)');

  setObject = { setNumber: 1, side1Score: 6, side2Score: 5, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('invalid winning game scoreString (3)');

  setObject = { setNumber: 1, side1Score: 8, side2Score: 6, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('invalid winning game scoreString (5)');

  setObject = {
    setNumber: 1,
    side1Score: 8,
    side2Score: 6,
    side1TiebreakScore: 7,
    side2TiebreakScore: 3,
    winningSide: 1,
  };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(isValidSetOutcome).toEqual(false);
  expect(error.message).toEqual('invalid winning game scoreString (5)');

  setObject = {
    setNumber: 1,
    side1Score: 7,
    side2Score: 6,
    side2TiebreakScore: 3,
    winningSide: 1,
  };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid tiebreak scores (1)');
  expect(isValidSetOutcome).toEqual(false);

  setObject = {
    setNumber: 1,
    side1Score: 7,
    side2Score: 6,
    side1TiebreakScore: 6,
    side2TiebreakScore: 3,
    winningSide: 1,
  };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid tiebreak scores (2)');
  expect(isValidSetOutcome).toEqual(false);

  setObject = {
    setNumber: 1,
    side1Score: 7,
    side2Score: 6,
    side1TiebreakScore: 7,
    side2TiebreakScore: 6,
    winningSide: 1,
  };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid tiebreak scores (3)');
  expect(isValidSetOutcome).toEqual(false);
});

test('can properly analyze final sets with no advantage and no tiebreak', () => {
  const FORMAT_WIMBLEDONE_2018 = 'SET5-S:6/TB7-F:6';
  const matchUpFormat = FORMAT_WIMBLEDONE_2018;
  const matchUpScoringFormat = parse(matchUpFormat);

  let error;
  let setObject = {
    setNumber: 5,
    side1Score: 12,
    side2Score: 10,
    winningSide: 1,
  };
  let analysis = analyzeSet({ setObject, matchUpScoringFormat });
  let { isValidSetOutcome } = analysis;
  expect(analysis.isValidSet).toEqual(true);
  expect(isValidSetOutcome).toEqual(true);

  setObject = { setNumber: 5, side1Score: 3, side2Score: 6, winningSide: 2 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ isValidSetOutcome } = analysis);
  expect(analysis.isValidSetNumber).toEqual(true);
  expect(analysis.isValidSet).toEqual(true);
  expect(isValidSetOutcome).toEqual(true);

  setObject = { setNumber: 5, side1Score: 12, side2Score: 9, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid winning game scoreString (4)');
  expect(analysis.isValidSetNumber).toEqual(true);
  expect(analysis.isValidSet).toEqual(false);
  expect(isValidSetOutcome).toEqual(false);

  setObject = { setNumber: 5, side1Score: 7, side2Score: 3, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid winning game scoreString (4)');
  expect(analysis.isValidSet).toEqual(false);
  expect(isValidSetOutcome).toEqual(false);

  setObject = { setNumber: 5, side1Score: 7, side2Score: 6, winningSide: 1 };
  analysis = analyzeSet({ setObject, matchUpScoringFormat });
  ({ standardSetError: error, isValidSetOutcome } = analysis);
  expect(error.message).toEqual('invalid winning game scoreString (3)');
  expect(analysis.isValidSet).toEqual(false);
  expect(isValidSetOutcome).toEqual(false);
  expect(analysis.isValidSet).toEqual(false);
});

test('can recognize when set format does not match expected format', () => {
  const FORMAT_BEST_OF_3_TB10 = 'SET3-S:TB10';
  const matchUpFormat = FORMAT_BEST_OF_3_TB10;
  const matchUpScoringFormat = parse(matchUpFormat);

  const setObject = {
    setNumber: 5,
    side1Score: 12,
    side2Score: 10,
    winningSide: 1,
  };
  const analysis = analyzeSet({ setObject, matchUpScoringFormat });
  expect(analysis.isValidSet).toEqual(false);
  expect(analysis.isValidSetOutcome).toEqual(false);
});
