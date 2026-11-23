import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import type { ResultType } from '@Types/factoryTypes';
import { defined } from '@Tests/helpers/defined';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('can set score for timed aggregate format SET3XA-S:T10', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      drawType: ROUND_ROBIN, // an elimination draw refuses a format that can end level (spec § 9.7)
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = defined(tournamentEngine.allTournamentMatchUps().matchUps, 'matchUps');
  const matchUp = matchUps[0];

  // Set the matchUp format to timed aggregate
  const result = tournamentEngine.setMatchUpFormat({
    drawId,
    matchUpId: matchUp.matchUpId,
    matchUpFormat: 'SET3XA-S:T10',
  });
  expect(result.success).toBe(true);

  // Set score: 10-11, 11-10, 1-0
  // Aggregate: side1=22, side2=21, winner=side1
  const outcome = {
    matchUpFormat: 'SET3XA-S:T10',
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          side1Score: 10,
          side2Score: 11,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 2,
        },
        {
          side1Score: 11,
          side2Score: 10,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 1,
        },
        {
          side1Score: 1,
          side2Score: 0,
          side1TiebreakScore: undefined,
          side2TiebreakScore: undefined,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
  };

  const setStatusResult: ResultType = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: matchUp.matchUpId,
    outcome,
  });

  expect(setStatusResult.success).toBe(true);

  // Verify the score was set correctly
  const updatedMatchUps = defined(
    tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [matchUp.matchUpId] },
    }).matchUps,
    'updatedMatchUps',
  );

  const updatedMatchUp = updatedMatchUps[0];
  const sets = defined(updatedMatchUp.score?.sets, 'score.sets');

  expect(updatedMatchUp.winningSide).toBe(1);
  expect(updatedMatchUp.matchUpStatus).toBe(COMPLETED);
  expect(updatedMatchUp.score?.sets?.length).toBe(3);

  // Verify set scores
  expect(sets[0].side1Score).toBe(10);
  expect(sets[0].side2Score).toBe(11);
  expect(sets[0].winningSide).toBe(2);

  expect(sets[1].side1Score).toBe(11);
  expect(sets[1].side2Score).toBe(10);
  expect(sets[1].winningSide).toBe(1);

  expect(sets[2].side1Score).toBe(1);
  expect(sets[2].side2Score).toBe(0);
  expect(sets[2].winningSide).toBe(1);
});

it('can set score for timed non-aggregate format SET3X-S:T10', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      drawType: ROUND_ROBIN, // an elimination draw refuses a format that can end level (spec § 9.7)
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = defined(tournamentEngine.allTournamentMatchUps().matchUps, 'matchUps');
  const matchUp = matchUps[0];

  // Set the matchUp format to timed (non-aggregate)
  const result = tournamentEngine.setMatchUpFormat({
    drawId,
    matchUpId: matchUp.matchUpId,
    matchUpFormat: 'SET3X-S:T10',
  });
  expect(result.success).toBe(true);

  // Set score: 10-11, 11-10, 1-0
  // Winner determined by sets won: side1 wins 2/3 sets
  const outcome = {
    matchUpFormat: 'SET3X-S:T10',
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          side1Score: 10,
          side2Score: 11,
          winningSide: 2,
          setNumber: 1,
        },
        {
          side1Score: 11,
          side2Score: 10,
          winningSide: 1,
          setNumber: 2,
        },
        {
          side1Score: 1,
          side2Score: 0,
          winningSide: 1,
          setNumber: 3,
        },
      ],
    },
    winningSide: 1,
  };

  const setStatusResult: ResultType = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: matchUp.matchUpId,
    outcome,
  });

  expect(setStatusResult.success).toBe(true);

  // Verify the score was set correctly
  const updatedMatchUps = defined(
    tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpIds: [matchUp.matchUpId] },
    }).matchUps,
    'updatedMatchUps',
  );

  const updatedMatchUp = updatedMatchUps[0];
  const sets = defined(updatedMatchUp.score?.sets, 'score.sets');

  expect(updatedMatchUp.winningSide).toBe(1);
  expect(updatedMatchUp.matchUpStatus).toBe(COMPLETED);
  expect(updatedMatchUp.score?.sets?.length).toBe(3);

  // Verify set scores
  expect(sets[0].side1Score).toBe(10);
  expect(sets[0].side2Score).toBe(11);
  expect(sets[0].winningSide).toBe(2);

  expect(sets[1].side1Score).toBe(11);
  expect(sets[1].side2Score).toBe(10);
  expect(sets[1].winningSide).toBe(1);

  expect(sets[2].side1Score).toBe(1);
  expect(sets[2].side2Score).toBe(0);
  expect(sets[2].winningSide).toBe(1);
});
