import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { allPlayoffPositionsFilled, isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { generateMatchUpOutcome } from '@Tests/helpers/generateMatchUpOutcome';
import { chunkArray, intersection } from '@Tools/arrays';
import { findStructure } from '@Acquire/findStructure';
import { setsValues } from './roundRobinSetsValues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DrawDefinition } from '@Types/tournamentTypes';
import { SINGLES } from '@Constants/eventConstants';
import {
  DRAW,
  MAIN,
  PLAY_OFF,
  POSITION,
  WATERFALL,
  ROUND_OUTCOME,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

const bronzeFlight = 'Bronze Flight';
const silverFlight = 'Silver Flight';
const greenFlight = 'Green Flight';
const goldFlight = 'Gold Flight';

it('can generate Round Robins 32 with playoffs', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const drawSize = 32;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const structureOptions = {
    playoffGroups: [
      { finishingPositions: [1], structureName: goldFlight },
      { finishingPositions: [2], structureName: silverFlight },
    ],
  };
  const result = generateDrawTypeAndModifyDrawDefinition({
    structureOptions,
    drawDefinition,
    drawSize,
    drawType,
  });
  const { structures: playoffStructures, links } = result;
  const mainStructure = playoffStructures?.shift();
  expect(mainStructure?.stage).toEqual(MAIN);
  expect(mainStructure?.structures?.length).toEqual(8);

  expect(playoffStructures?.length).toEqual(2);
  expect(playoffStructures?.[0].structureName).toEqual(goldFlight);
  expect(playoffStructures?.[1].structureName).toEqual(silverFlight);

  expect(playoffStructures?.[0].stage).toEqual(PLAY_OFF);
  expect(playoffStructures?.[0].finishingPosition).toEqual(ROUND_OUTCOME);
  expect(playoffStructures?.[0].matchUps?.length).toEqual(7);
  expect(playoffStructures?.[0].matchUps?.[0].finishingRound).toEqual(3);

  expect(links?.length).toEqual(2);
  expect(links?.[0].linkType).toEqual(POSITION);
  expect(links?.[0].source.finishingPositions).toMatchObject([1]);
  expect(links?.[0].target.roundNumber).toEqual(1);
  expect(links?.[0].target.feedProfile).toEqual(DRAW);

  expect(links?.[1].linkType).toEqual(POSITION);
  expect(links?.[1].source.finishingPositions).toMatchObject([2]);
  expect(links?.[1].target.roundNumber).toEqual(1);
  expect(links?.[1].target.feedProfile).toEqual(DRAW);
});

it('can generate Round Robins 16 with playoffs', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const structureOptions = {
    playoffGroups: [
      { finishingPositions: [1], structureName: goldFlight },
      { finishingPositions: [2], structureName: silverFlight },
    ],
  };
  const result = generateDrawTypeAndModifyDrawDefinition({
    structureOptions,
    drawDefinition,
    drawSize: 16,
    drawType,
  });

  const { structures: playoffStructures, links } = result;
  const mainStructure = playoffStructures?.shift();
  expect(mainStructure?.stage).toEqual(MAIN);
  expect(mainStructure?.structures?.length).toEqual(4);

  expect(playoffStructures?.length).toEqual(2);
  expect(playoffStructures?.[0].structureName).toEqual(goldFlight);
  expect(playoffStructures?.[1].structureName).toEqual(silverFlight);

  expect(playoffStructures?.[0].stage).toEqual(PLAY_OFF);
  expect(playoffStructures?.[0].finishingPosition).toEqual(ROUND_OUTCOME);
  expect(playoffStructures?.[0].matchUps?.length).toEqual(3);
  expect(playoffStructures?.[0].matchUps?.[0].finishingRound).toEqual(2);

  expect(links?.length).toEqual(2);
  expect(links?.[0].linkType).toEqual(POSITION);
  expect(links?.[0].source.finishingPositions).toMatchObject([1]);
  expect(links?.[0].target.roundNumber).toEqual(1);
  expect(links?.[0].target.feedProfile).toEqual(DRAW);

  expect(links?.[1].linkType).toEqual(POSITION);
  expect(links?.[1].source.finishingPositions).toMatchObject([2]);
  expect(links?.[1].target.roundNumber).toEqual(1);
  expect(links?.[1].target.feedProfile).toEqual(DRAW);
});

it('can generate Round Robin with Playoffs', () => {
  const drawSize = 20;
  const groupSize = 5;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const structureOptions = {
    groupSize,
    playoffGroups: [
      { finishingPositions: [1], structureName: goldFlight },
      { finishingPositions: [2], structureName: silverFlight },
      { finishingPositions: [3], structureName: bronzeFlight },
      { finishingPositions: [4], structureName: greenFlight },
      { finishingPositions: [5], structureName: 'Yellow Flight' },
    ],
  };
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    structureOptions,
    drawType,
    drawSize,
  });

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);
  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);
  expect(mainStructure.structures.length).toEqual(4);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(5);
  expect(playoffStructures.length).toEqual(5);
  expect(playoffStructures[0].positionAssignments.length).toEqual(4);
});

it('can advance players in Round Robin with Playoffs', () => {
  const drawSize = 16;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const playoffStructuresCount = 4;
  const structureOptions = {
    groupSize,
    playoffGroups: [
      { finishingPositions: [1], structureName: goldFlight },
      { finishingPositions: [2], structureName: silverFlight },
      { finishingPositions: [3], structureName: bronzeFlight },
      { finishingPositions: [4], structureName: greenFlight },
    ],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: drawSize },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Round Robin w/ Playoffs',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent, success } = result;
  const { eventId } = createdEvent;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const matchUpFormat = FORMAT_STANDARD;
  let { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingProfile: { positioning: WATERFALL },
    structureOptions,
    matchUpFormat,
    drawType,
    drawSize,
    eventId,
  });

  expect(drawDefinition.links.length).toEqual(playoffStructuresCount);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(4);
  expect(playoffStructures[0].positionAssignments.length).toEqual(4);

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const { drawId } = drawDefinition;
  const { matchUps: allStructureMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [mainStructure.structureId] },
    inContext: true,
  });
  const allStructureMatchUpsCount = allStructureMatchUps.length;
  const matchUpsPerStructure = allStructureMatchUpsCount / (drawSize / groupSize);
  mainStructure.structures.forEach((structure, structureOrder) => {
    const values = setsValues[structureOrder];
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues = values[matchUpIndex];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
      const thisStructureIsCompleted = isCompletedStructure({
        structureId: structure.structureId,
        drawDefinition,
      });
      expect(thisStructureIsCompleted).toEqual(matchUpIndex + 1 === matchUpsPerStructure);

      const matchUpInstance = structureOrder * matchUpsPerStructure + (matchUpIndex + 1);
      const mainStructureIsCompleted = isCompletedStructure({
        structureId: mainStructure.structureId,
        drawDefinition,
      });
      const expectCompletedStructure = matchUpInstance === allStructureMatchUpsCount;
      expect(mainStructureIsCompleted).toEqual(expectCompletedStructure);
    });
  });

  const { matchUps: eventMatchUps } = tournamentEngine.allEventMatchUps({
    inContext: true,
    eventId,
  });

  const finishingPositionGroups = {};
  mainStructure.structures.forEach((structure) => {
    const { structureId } = structure;
    const structureMatchUps = eventMatchUps.filter((matchUp) => matchUp.structureId === structureId);
    const { participantResults } = tallyParticipantResults({
      matchUps: structureMatchUps,
      matchUpFormat,
    });
    Object.keys(participantResults).forEach((key) => {
      const { groupOrder } = participantResults[key];
      if (!finishingPositionGroups[groupOrder]) finishingPositionGroups[groupOrder] = [];
      finishingPositionGroups[groupOrder].push(key);
      expect([1, 2, 3, 4].includes(groupOrder)).toEqual(true);
    });
  });
  Object.keys(finishingPositionGroups).forEach((key) => {
    expect(finishingPositionGroups[key].length).toEqual(groupsCount);
  });

  playoffStructures.forEach((structure) => {
    const { structureId } = structure;
    // position participants
    const result = tournamentEngine.automatedPositioning({
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // verify that positioning participants are expected
    const { drawDefinition: updatedDrawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structure: updatedStructure } = findStructure({
      drawDefinition: updatedDrawDefinition,
      structureId,
    });
    const positioningLink = positioningLinks.find((link) => link.target.structureId === structure.structureId);
    const structureFinishingPositions = positioningLink.source.finishingPositions;
    const finishingPositionGroup = structureFinishingPositions
      .map((finishingPosition) => finishingPositionGroups[finishingPosition])
      .flat();
    const structureParticipantIds = updatedStructure?.positionAssignments
      ?.map((assignment) => assignment.participantId)
      .filter(Boolean);
    const expectedParticipantIds = intersection(structureParticipantIds, finishingPositionGroup);
    expect(expectedParticipantIds.length).toEqual(groupsCount);
  });

  const { drawDefinition: updatedDrawDefinition } = tournamentEngine.getEvent({
    drawId,
  });
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: updatedDrawDefinition,
  });
  expect(allPositionsFilled).toEqual(true);
});

it('can advance players in Round Robin with Playoffs with 5 per playoff structure', () => {
  const drawSize = 20;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const structureOptions = {
    groupSize,
    playoffGroups: [
      {
        finishingPositions: [1],
        structureName: goldFlight,
      },
      {
        finishingPositions: [2],
        structureName: silverFlight,
        drawType: SINGLE_ELIMINATION,
      },
      { finishingPositions: [3], structureName: bronzeFlight },
      { finishingPositions: [4], structureName: greenFlight },
    ],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: drawSize },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Round Robin w/ Playoffs',
    eventType: SINGLES,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent, success } = result;
  const { eventId } = createdEvent;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const matchUpFormat = FORMAT_STANDARD;
  let { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingProfile: { positioning: WATERFALL },
    structureOptions,
    matchUpFormat,
    drawSize,
    drawType,
    eventId,
  });

  // if FEDD_FMLC
  // expect(drawDefinition.links.length).toEqual(playoffStructuresCount);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(4);
  expect(playoffStructures[0].positionAssignments.length).toEqual(8);

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  // if FEDD_FMLC
  /*
  expect(loserLinks.length).toEqual(1);
  expect(
    playoffStructureIds.includes(loserLinks[0].source.structureId)
  ).toEqual(true);
  */

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const { drawId } = drawDefinition;

  const structure = drawDefinition.structures.find(({ structureId }) => structureId === mainStructure.structureId);
  const allStructureMatchUps = getAllStructureMatchUps({
    structure,
  }).matchUps;

  const allStructureMatchUpsCount = allStructureMatchUps.length;
  const matchUpsPerStructure = allStructureMatchUpsCount / (drawSize / groupSize);
  mainStructure.structures.forEach((structure, structureOrder) => {
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues = [
        [6, 3],
        [6, 3],
      ];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);

      ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
      const thisStructureIsCompleted = isCompletedStructure({
        structureId: structure.structureId,
        drawDefinition,
      });
      expect(thisStructureIsCompleted).toEqual(matchUpIndex + 1 === matchUpsPerStructure);

      const matchUpInstance = structureOrder * matchUpsPerStructure + (matchUpIndex + 1);
      const mainStructureIsCompleted = isCompletedStructure({
        structureId: mainStructure.structureId,
        drawDefinition,
      });
      const expectCompletedStructure = matchUpInstance === allStructureMatchUpsCount;
      expect(mainStructureIsCompleted).toEqual(expectCompletedStructure);
    });
  });

  const { matchUps: eventMatchUps } = tournamentEngine.allEventMatchUps({
    inContext: true,
    eventId,
  });

  const finishingPositionGroups = {};
  const structureParticipantGroupings: string[][] = [];

  mainStructure.structures.forEach((structure) => {
    const { structureId } = structure;
    const structureMatchUps = eventMatchUps.filter((matchUp) => matchUp.structureId === structureId);
    const { participantResults } = tallyParticipantResults({
      matchUps: structureMatchUps,
      matchUpFormat,
    });

    const structureParticipantIds = Object.keys(participantResults);
    structureParticipantGroupings.push(structureParticipantIds);

    structureParticipantIds.forEach((key) => {
      const { groupOrder } = participantResults[key];
      if (!finishingPositionGroups[groupOrder]) finishingPositionGroups[groupOrder] = [];
      finishingPositionGroups[groupOrder].push(key);
      expect([1, 2, 3, 4].includes(groupOrder)).toEqual(true);
    });
  });

  Object.keys(finishingPositionGroups).forEach((key) => {
    expect(finishingPositionGroups[key].length).toEqual(groupsCount);
  });

  playoffStructures.forEach((structure) => {
    const { structureId } = structure;
    // position participants
    tournamentEngine.automatedPositioning({
      drawId,
      structureId,
    });

    // verify that positioning participants are expected
    const { drawDefinition: updatedDrawDefinition } = tournamentEngine.getEvent({ drawId });
    const { structure: updatedStructure } = findStructure({
      drawDefinition: updatedDrawDefinition,
      structureId,
    });
    const positioningLink = positioningLinks.find((link) => link.target.structureId === structure.structureId);
    const structureFinishingPositions = positioningLink.source.finishingPositions;
    const finishingPositionGroup = structureFinishingPositions
      .map((finishingPosition) => finishingPositionGroups[finishingPosition])
      .flat();
    const structureParticipantIds = updatedStructure?.positionAssignments
      ?.map((assignment) => assignment.participantId)
      .filter(Boolean);
    const expectedParticipantIds = intersection(structureParticipantIds, finishingPositionGroup);
    expect(expectedParticipantIds.length).toEqual(groupsCount);

    const positionAssignments = updatedStructure?.positionAssignments ?? [];
    const pairedPositions = chunkArray(positionAssignments, 2);
    const pairedParticipantIds = pairedPositions
      .map((positions) => positions.map((position) => position.participantId))
      .filter((pair) => pair.filter((p) => p).length === 2);

    pairedParticipantIds.forEach((pair) => {
      structureParticipantGroupings.forEach((grouping) => {
        const overlap = intersection(grouping, pair);
        expect(overlap.length).toBeLessThan(2);
      });
    });
  });

  const { drawDefinition: updatedDrawDefinition } = tournamentEngine.getEvent({
    drawId,
  });
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: updatedDrawDefinition,
  });
  expect(allPositionsFilled).toEqual(true);

  // these loser finishingPositions are the result of finishingPositionLimit
  // there can be playoff structures with BYEs which means there are more drawPositions than there are finishingPositions
  expect(playoffStructures[0].matchUps[0].finishingPositionRange.winner).toEqual([1, 4]);
  expect(playoffStructures[0].matchUps[0].finishingPositionRange.loser).toEqual([5, 5]);

  expect(playoffStructures[1].matchUps[0].finishingPositionRange.winner).toEqual([6, 9]);
  expect(playoffStructures[1].matchUps[0].finishingPositionRange.loser).toEqual([10, 10]);

  expect(playoffStructures[2].matchUps[0].finishingPositionRange.winner).toEqual([11, 14]);
  expect(playoffStructures[2].matchUps[0].finishingPositionRange.loser).toEqual([15, 15]);

  expect(playoffStructures[3].matchUps[0].finishingPositionRange.winner).toEqual([16, 19]);
  expect(playoffStructures[3].matchUps[0].finishingPositionRange.loser).toEqual([20, 20]);
});
