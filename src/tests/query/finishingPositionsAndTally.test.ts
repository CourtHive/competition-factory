import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getParticipantResults } from '@Query/matchUps/roundRobinTally/getParticipantResults';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

import { ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/matchUpTypes';
import { ELO } from '@Constants/ratingConstants';

test('getParticipantIdFinishingPositions for round robin draw', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: ROUND_ROBIN,
        structureOptions: { groupSize: 4 },
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const result = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
  // Result should be an object mapping participantIds to their finishing positions
  expect(result).toBeDefined();
  expect(typeof result).toEqual('object');

  const participantEntries = Object.keys(result);
  // 8 participants should have finishing positions
  expect(participantEntries.length).toEqual(8);

  participantEntries.forEach((participantId) => {
    const data = result[participantId];
    expect(data.finishingPositionRange).toBeDefined();
    expect(data.relevantMatchUps).toBeDefined();
  });
});

test('getParticipantIdFinishingPositions for round robin with playoff', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        structureOptions: { groupSize: 4 },
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const result = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
  expect(result).toBeDefined();
  expect(typeof result).toEqual('object');
});

test('getParticipantIdFinishingPositions for single elimination', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });

  const result = tournamentEngine.getParticipantIdFinishingPositions({ drawId });
  expect(result).toBeDefined();
  const entries = Object.values(result);
  expect(entries.length).toEqual(8);
});

test('getParticipantIdFinishingPositions with byeAdvancements', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
    completeAllMatchUps: true,
    setState: true,
  });

  const result = tournamentEngine.getParticipantIdFinishingPositions({
    byeAdvancements: true,
    drawId,
  });
  expect(result).toBeDefined();
});

test('getParticipantResults with groupingTotal setsPct uses totalSets', () => {
  // Generate a round robin tournament and get in-context matchUps
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        drawType: ROUND_ROBIN,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    drawId,
    inContext: true,
  });

  // Filter to a single structure's matchUps (RR group)
  const structureIds = [...new Set(matchUps.map((m) => m.structureId))];
  const groupMatchUps = matchUps.filter((m) => m.structureId === structureIds[0]);

  // Call getParticipantResults with groupingTotal='setsPct'
  // This exercises the calculatePercentages code path where totalSets is used
  const resultSetsPct = getParticipantResults({
    matchUps: groupMatchUps,
    groupingTotal: 'setsPct',
  });
  expect(resultSetsPct.participantResults).toBeDefined();
  const participantIds = Object.keys(resultSetsPct.participantResults);
  expect(participantIds.length).toBeGreaterThan(0);

  // Verify setsPct is calculated
  participantIds.forEach((pid) => {
    const pr = resultSetsPct.participantResults[pid];
    expect(pr.setsPct).toBeDefined();
    expect(typeof pr.setsPct).toEqual('number');
  });
});

test('getParticipantResults with groupingTotal gamesPct uses totalGames', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 4,
        drawType: ROUND_ROBIN,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    drawId,
    inContext: true,
  });

  const structureIds = [...new Set(matchUps.map((m) => m.structureId))];
  const groupMatchUps = matchUps.filter((m) => m.structureId === structureIds[0]);

  // Call getParticipantResults with groupingTotal='gamesPct'
  // This exercises the calculatePercentages code path where totalGames is used
  const resultGamesPct = getParticipantResults({
    matchUps: groupMatchUps,
    groupingTotal: 'gamesPct',
  });
  expect(resultGamesPct.participantResults).toBeDefined();
  const participantIds = Object.keys(resultGamesPct.participantResults);
  expect(participantIds.length).toBeGreaterThan(0);

  participantIds.forEach((pid) => {
    const pr = resultGamesPct.participantResults[pid];
    expect(pr.gamesPct).toBeDefined();
    expect(typeof pr.gamesPct).toEqual('number');
  });
});

test('calculatePressureRatings via tallyParticipantResults with ELO-rated participants', () => {
  // Generate participants with ELO ratings so that calculatePressureRatings is exercised
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: {
      category: { ratingType: ELO },
      participantsCount: 8,
    },
    drawProfiles: [
      {
        drawSize: 4,
        drawType: ROUND_ROBIN,
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  // Get in-context matchUps with participant details (including ratings)
  const { matchUps } = tournamentEngine.allDrawMatchUps({
    drawId,
    inContext: true,
  });

  const structureIds = [...new Set(matchUps.map((m) => m.structureId))];
  const groupMatchUps = matchUps.filter((m) => m.structureId === structureIds[0]);

  // Verify some matchUps have SINGLES type and participants with ratings
  const singlesMatchUps = groupMatchUps.filter((m) => m.matchUpType === SINGLES);
  expect(singlesMatchUps.length).toBeGreaterThan(0);

  // Call tallyParticipantResults with pressureRating to trigger calculatePressureRatings
  const result = tallyParticipantResults({
    matchUps: groupMatchUps,
    pressureRating: true,
  });

  expect(result.participantResults).toBeDefined();

  // Verify pressure-related fields exist
  Object.values(result.participantResults).forEach((pr: any) => {
    expect(pr.pressureScores).toBeDefined();
    expect(Array.isArray(pr.pressureScores)).toBe(true);
    // pressureOrder is set by addPressureOrder when pressureRating is truthy
    expect(pr.pressureOrder).toBeDefined();
  });
});

test('getParticipantResults with round robin includes all tally fields', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: ROUND_ROBIN,
        structureOptions: { groupSize: 4 },
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  // The round robin tally should have run during completion
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.some((m) => m.winningSide)).toEqual(true);

  // Get in-context matchUps for a single group
  const { matchUps: contextMatchUps } = tournamentEngine.allDrawMatchUps({
    drawId,
    inContext: true,
  });

  const structureIds = [...new Set(contextMatchUps.map((m) => m.structureId))];
  const groupMatchUps = contextMatchUps.filter((m) => m.structureId === structureIds[0]);

  const { participantResults } = getParticipantResults({
    matchUps: groupMatchUps,
  });

  // Verify all expected fields exist on each participant result
  Object.values(participantResults).forEach((pr: any) => {
    expect(pr.matchUpsWon).toBeDefined();
    expect(pr.matchUpsLost).toBeDefined();
    expect(pr.setsWon).toBeDefined();
    expect(pr.setsLost).toBeDefined();
    expect(pr.gamesWon).toBeDefined();
    expect(pr.gamesLost).toBeDefined();
    expect(pr.matchUpsPct).toBeDefined();
    expect(pr.setsPct).toBeDefined();
    expect(pr.gamesPct).toBeDefined();
    expect(pr.result).toBeDefined();
    // result should be in "W/L" format
    expect(pr.result).toMatch(/^\d+\/\d+$/);
  });
});
