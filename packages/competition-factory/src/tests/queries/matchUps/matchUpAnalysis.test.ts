import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import { FORMAT_ATP_DOUBLES, FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';

test('can handle empty matchUp', () => {
  let analysis = analyzeMatchUp();
  expect(analysis.error).toEqual(MISSING_MATCHUP);

  analysis = analyzeMatchUp({});
  expect(analysis.error).toEqual(MISSING_MATCHUP);
});

test('generated completed mock matchUp', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
  });
  tournamentEngine.setState(tournamentRecord);
  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps();

  const analysis = analyzeMatchUp({ matchUp });
  expect(analysis.calculatedWinningSide).toEqual(1);
  expect(analysis.validMatchUpWinningSide).toEqual(true);
});

test('can properly analyze completed standard format matchUp', () => {
  const matchUp = {
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
        {
          setNumber: 3,
          side1Score: 7,
          side2Score: 6,
          side1TiebreakScore: 7,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
    matchUpFormat: FORMAT_STANDARD,
  };

  let analysis = analyzeMatchUp({ matchUp });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(false);
  expect(analysis.isCompletedSet).toEqual(undefined);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isCompletedMatchUp).toEqual(true);
  expect(analysis.isValidSetOutcome).toEqual(undefined);
  expect(analysis.validMatchUpOutcome).toEqual(true);

  analysis = analyzeMatchUp({ matchUp, setNumber: 1 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(true);
  expect(analysis.isCompletedSet).toEqual(true);
  expect(analysis.isDecidingSet).toEqual(false);
  expect(analysis.isLastSetWithValues).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isValidSetOutcome).toEqual(true);
  expect(analysis.validMatchUpOutcome).toEqual(true);

  expect(analysis.sideGameScoresCount).toEqual(2);
  expect(analysis.sidePointScoresCount).toEqual(0);
  expect(analysis.sideTiebreakScoresCount).toEqual(0);

  analysis = analyzeMatchUp({ matchUp, setNumber: 2 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(true);
  expect(analysis.isCompletedSet).toEqual(true);
  expect(analysis.isDecidingSet).toEqual(false);
  expect(analysis.isLastSetWithValues).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isValidSetOutcome).toEqual(true);

  expect(analysis.sideGameScoresCount).toEqual(2);
  expect(analysis.sidePointScoresCount).toEqual(0);
  expect(analysis.sideTiebreakScoresCount).toEqual(0);

  analysis = analyzeMatchUp({ matchUp, setNumber: 3 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(true);
  expect(analysis.isCompletedSet).toEqual(true);
  expect(analysis.isDecidingSet).toEqual(true);
  expect(analysis.isLastSetWithValues).toEqual(true);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isValidSetOutcome).toEqual(true);

  analysis = analyzeMatchUp({ matchUp, setNumber: 3, sideNumber: 1 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(true);
  expect(analysis.existingValue).toEqual(7);
  analysis = analyzeMatchUp({ matchUp, setNumber: 3, sideNumber: 2 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(true);
  expect(analysis.existingValue).toEqual(6);

  expect(analysis.sideGameScoresCount).toEqual(2);
  expect(analysis.sidePointScoresCount).toEqual(0);
  expect(analysis.sideTiebreakScoresCount).toEqual(2);

  analysis = analyzeMatchUp({
    matchUp,
    setNumber: 3,
    sideNumber: 1,
    isTiebreakValue: true,
  });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(true);
  expect(analysis.existingValue).toEqual(7);
  analysis = analyzeMatchUp({
    matchUp,
    setNumber: 3,
    sideNumber: 2,
    isTiebreakValue: true,
  });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.hasExistingValue).toEqual(true);
  expect(analysis.existingValue).toEqual(3);
});

test('can properly analyze completed standard doubles matchUp', () => {
  const matchUp = {
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
        {
          setNumber: 3,
          side1TiebreakScore: 10,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
    matchUpFormat: FORMAT_ATP_DOUBLES,
  };

  let analysis = analyzeMatchUp({ matchUp });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(false);
  expect(analysis.expectTiebreakSet).toEqual(undefined);
  expect(analysis.isTiebreakSet).toEqual(undefined);
  expect(analysis.isCompletedSet).toEqual(undefined);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isCompletedMatchUp).toEqual(true);
  expect(analysis.isLastSetWithValues).toEqual(false);
  expect(analysis.validMatchUpOutcome).toEqual(true);

  analysis = analyzeMatchUp({ matchUp, setNumber: 3 });
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(true);
  expect(analysis.isDecidingSet).toEqual(true);
  expect(analysis.expectTiebreakSet).toEqual(true);
  expect(analysis.isTiebreakSet).toEqual(true);
  expect(analysis.isCompletedSet).toEqual(true);
});

test('can properly analyze completed Best of 3 tiebreak sets', () => {
  const FORMAT_BEST_OF_3_TB10 = 'SET3-S:TB10';
  const matchUp = {
    score: {
      sets: [
        {
          setNumber: 1,
          side1TiebreakScore: 10,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
        {
          setNumber: 2,
          side1TiebreakScore: 7,
          side2TiebreakScore: 10,
          winningSide: 2,
        },
        {
          setNumber: 3,
          side1TiebreakScore: 10,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
    matchUpFormat: FORMAT_BEST_OF_3_TB10,
  };

  let analysis = analyzeMatchUp({ matchUp });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(false);
  expect(analysis.isCompletedSet).toEqual(undefined);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isCompletedMatchUp).toEqual(true);
  expect(analysis.validMatchUpOutcome).toEqual(true);

  analysis = analyzeMatchUp({ matchUp, setNumber: 1 });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isActiveSet).toEqual(false);
  expect(analysis.isExistingSet).toEqual(true);
  expect(analysis.isCompletedSet).toEqual(true);
  expect(analysis.hasExistingValue).toEqual(false);
  expect(analysis.isCompletedMatchUp).toEqual(true);
  expect(analysis.validMatchUpOutcome).toEqual(true);
});

test('can recognize when sets do not map to matchUpFormat', () => {
  const FORMAT_BEST_OF_3_TB10 = 'SET3-S:TB10';
  const matchUp = {
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
        {
          setNumber: 3,
          side1TiebreakScore: 10,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
    matchUpFormat: FORMAT_BEST_OF_3_TB10,
  };

  let analysis = analyzeMatchUp({ matchUp });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.validMatchUpOutcome).toEqual(false);

  analysis = analyzeMatchUp({ matchUp, setNumber: 1 });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isValidSetOutcome).toEqual(false);

  analysis = analyzeMatchUp({ matchUp, setNumber: 2 });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isValidSetOutcome).toEqual(false);

  analysis = analyzeMatchUp({ matchUp, setNumber: 3 });
  expect(analysis.completedSetsCount).toEqual(3);
  expect(analysis.isValidSetOutcome).toEqual(true);
  expect(analysis.isValidTiebreakSetOutcome).toEqual(true);
});
