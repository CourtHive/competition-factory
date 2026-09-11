import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TALLY } from '@Constants/extensionConstants';

it('round robins with timed formats will default to game based when no indicator', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    randomWinningSide: true,
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET1-S:T20' }],
  });

  const result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // Expect thhere to be a single set in every matchUp
  expect(matchUps.every(({ score }) => score.sets.length === 1)).toEqual(true);

  const { drawId, structureId } = matchUps[0];
  const positionAssignments = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }).positionAssignments;

  const p1Result = firstClassOrExtension({ element: positionAssignments[0], attribute: 'tally', name: TALLY });
  const { gamesWon, gamesLost, pointsWon, pointsLost } = p1Result;
  expect(gamesWon + gamesLost).toBeGreaterThan(1);
  expect(pointsWon + pointsLost).toEqual(0);
});

it('round robins with points based timed formats to tally points not games', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, matchUpFormat: 'SET1-S:T20P' }],
    completeAllMatchUps: true,
    randomWinningSide: true,
    setState: true,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // Expect thhere to be a single set in every matchUp
  expect(matchUps.every(({ score }) => score.sets.length === 1)).toEqual(true);

  const { drawId, structureId } = matchUps[0];
  const positionAssignments = tournamentEngine.getPositionAssignments({
    structureId,
    drawId,
  }).positionAssignments;

  const p1Result = firstClassOrExtension({ element: positionAssignments[0], attribute: 'tally', name: TALLY });
  const { gamesWon, gamesLost, pointsWon, pointsLost, pointsPct } = p1Result;
  const pct = Math.round((pointsWon / (pointsWon + pointsLost)) * 1000) / 1000;
  expect(pointsPct).toEqual(pct);
  expect(pointsWon + pointsLost).toBeGreaterThan(1);
  expect(gamesWon + gamesLost).toEqual(0);
});

it('can tally points when different finalSet format', () => {
  const matchUpFormat = 'SET3-S:6/TB7-F:T20P';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, matchUpFormat }],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  let matchUp = matchUps[0];

  expect(matchUp.matchUpFormat).toEqual(matchUpFormat);

  // verify that square brackets denote points
  let outcome = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 1-6 [23-45]',
  }).outcome;
  outcome.winningSide = 2;
  let thirdSet = outcome.score.sets.find(({ setNumber }) => setNumber === 3);
  expect(thirdSet.winningSide).toEqual(2);
  expect(thirdSet.side1TiebreakScore).toEqual(23);
  expect(thirdSet.side2TiebreakScore).toEqual(45);

  // no square brackets denotes games...
  // ...but in this case the matchUpFormat will ensure result is calculated as points
  outcome = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 1-6 23-45',
  }).outcome;
  outcome.winningSide = 2;
  thirdSet = outcome.score.sets.find(({ setNumber }) => setNumber === 3);
  expect(thirdSet.winningSide).toEqual(2);
  expect(thirdSet.side1Score).toEqual(23);
  expect(thirdSet.side2Score).toEqual(45);

  const { matchUpId, drawId } = matchUp;
  result = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
  expect(result.success).toEqual(true);

  matchUp = tournamentEngine.findMatchUp({
    inContext: true,
    matchUpId,
    drawId,
  }).matchUp;

  const { participantResults } = tallyParticipantResults({
    matchUps: [matchUp],
  });
  const sideIds = matchUp.sides
    .sort((a, b) => a.sideNumber - b.sideNumber) // ensure sides are ordered
    .map(getParticipantId);
  const sideTallies = sideIds.map((id) => participantResults[id]);

  let { gamesWon, gamesLost, pointsWon, pointsLost } = sideTallies[0];
  expect(pointsLost).toEqual(45);
  expect(pointsWon).toEqual(23);
  expect(gamesLost).toEqual(7);
  expect(gamesWon).toEqual(7);

  ({ gamesWon, gamesLost, pointsWon, pointsLost } = sideTallies[1]);
  expect(pointsLost).toEqual(23);
  expect(pointsWon).toEqual(45);
  expect(gamesLost).toEqual(7);
  expect(gamesWon).toEqual(7);
});
