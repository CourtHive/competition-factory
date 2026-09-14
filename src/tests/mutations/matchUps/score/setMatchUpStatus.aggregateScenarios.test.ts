import { COMPLETED } from '@Constants/tournamentConstants';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const exactly3aggregateTimedSets = 'SET3XA-S:T10';

function generateMatchUpOutcome(params: { matchUpFormat: string }) {
  const drawProfiles = [
    {
      matchUpFormat: params.matchUpFormat,
      drawType: 'SINGLE_ELIMINATION',
      drawSize: 4,
    },
  ];
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  return {
    tournamentRecord,
    drawId: drawIds[0],
    eventId: tournamentRecord.events[0].eventId,
    matchUps,
  };
}

it('correctly calculates aggregate winner for SET3XA-S:T10 with uneven scores (30-0, 0-1, 0-1)', () => {
  const {
    drawId,
    matchUps: [matchUp],
  } = generateMatchUpOutcome({ matchUpFormat: exactly3aggregateTimedSets });

  // Set the matchUp format first
  const formatResult = tournamentEngine.setMatchUpFormat({
    drawId,
    matchUpId: matchUp.matchUpId,
    matchUpFormat: exactly3aggregateTimedSets,
  });
  expect(formatResult.success).toBe(true);

  // Simulate the exact scenario from the freeScore modal:
  // Set 1: 30-0 (side 1 wins)
  // Set 2: 0-1 (side 2 wins)
  // Set 3: 0-1 (side 2 wins)
  // Aggregate: side 1 = 30, side 2 = 2
  // Expected winner: side 1 (30 > 2)
  const outcome = {
    matchUpFormat: exactly3aggregateTimedSets,
    matchUpStatus: COMPLETED,
    score: {
      sets: [
        {
          setNumber: 1,
          side1Score: 30,
          side2Score: 0,
          winningSide: 1,
        },
        {
          setNumber: 2,
          side1Score: 0,
          side2Score: 1,
          winningSide: 2,
        },
        {
          setNumber: 3,
          side1Score: 0,
          side2Score: 1,
          winningSide: 2,
        },
      ],
    },
    winningSide: 1, // Should be side 1 based on aggregate (30 > 2)
  };

  const setStatusResult = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome,
    drawId,
  });

  expect(setStatusResult.success).toBe(true);

  const { matchUps: updatedMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUp.matchUpId] },
  });

  const updatedMatchUp = updatedMatchUps[0];

  // Verify aggregate calculation: side1 = 30, side2 = 2, so side1 wins
  expect(updatedMatchUp.winningSide).toBe(1);
  expect(updatedMatchUp.matchUpStatus).toBe('COMPLETED');

  const aggregateSide1 = updatedMatchUp.score.sets.reduce((sum, set) => sum + (set.side1Score || 0), 0);
  const aggregateSide2 = updatedMatchUp.score.sets.reduce((sum, set) => sum + (set.side2Score || 0), 0);

  expect(aggregateSide1).toBe(30);
  expect(aggregateSide2).toBe(2);
  expect(aggregateSide1).toBeGreaterThan(aggregateSide2);
});
