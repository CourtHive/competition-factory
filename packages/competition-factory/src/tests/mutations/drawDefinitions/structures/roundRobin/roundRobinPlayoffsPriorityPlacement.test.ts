import { allPlayoffPositionsFilled, isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { generateMatchUpOutcome } from '@Tests/helpers/generateMatchUpOutcome';
import { chunkArray, intersection } from '@Tools/arrays';
import { findStructure } from '@Acquire/findStructure';
import { setsValues } from './roundRobinSetsValues';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES } from '@Constants/eventConstants';
import {
  MAIN,
  PLAY_OFF,
  POSITION,
  WATERFALL,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

it('can advance players in Round Robin with Playoffs => 2 x 4 x 4', () => {
  const drawSize = 16;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const playoffGroups = [
    {
      finishingPositions: [1, 2],
      structureName: 'Gold Flight',
      drawType: SINGLE_ELIMINATION,
    },
    {
      finishingPositions: [3, 4],
      structureName: 'Silver Flight',
      drawType: SINGLE_ELIMINATION,
    },
  ];
  const structureOptions = {
    groupSize,
    playoffGroups,
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

  expect(drawDefinition.links.length).toEqual(playoffGroups.length);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(playoffGroups.length);
  expect(playoffStructures[0].positionAssignments.length).toEqual(8);

  const playoffStructureIds = new Set(playoffStructures.map((structure) => structure.structureId));

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.has(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const { drawId } = drawDefinition;
  const structure = drawDefinition.structures.find(({ structureId }) => structureId === mainStructure.structureId);
  const { matchUps: allStructureMatchUps } = getAllStructureMatchUps({
    inContext: true,
    structure,
  });
  const allStructureMatchUpsCount = allStructureMatchUps.length;
  const matchUpsPerStructure = allStructureMatchUpsCount / (drawSize / groupSize);
  mainStructure.structures.forEach((structure, structureOrder) => {
    const values = setsValues[0];
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues: any = values?.[matchUpIndex];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome,
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
        drawDefinition,
        structureId: mainStructure.structureId,
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
    const finishingPositionGroup = structureFinishingPositions.flatMap(
      (finishingPosition) => finishingPositionGroups[finishingPosition],
    );
    const structureParticipantIds = updatedStructure?.positionAssignments
      ?.map((assignment) => assignment.participantId)
      .filter(Boolean);
    const expectedParticipantIds = intersection(structureParticipantIds, finishingPositionGroup);
    expect(expectedParticipantIds.length).toEqual(groupsCount * structureFinishingPositions.length);

    const positionAssignments = updatedStructure?.positionAssignments ?? [];
    const pairedPositions = chunkArray(positionAssignments, 2);
    const pairedParticipantIds = pairedPositions
      .map((positions) => positions.map((position) => position.participantId))
      .filter((pair) => pair.filter(Boolean).length === 2);

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
});

it('can advance players in Round Robin with Playoffs', () => {
  const drawSize = 20;
  const groupSize = 4;
  const groupsCount = drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const playoffGroups = [
    {
      finishingPositions: [1, 2],
      structureName: 'Gold Flight',
      drawType: SINGLE_ELIMINATION,
    },
    {
      finishingPositions: [3, 4],
      structureName: 'Silver Flight',
      drawType: SINGLE_ELIMINATION,
    },
  ];
  const structureOptions = {
    groupSize,
    playoffGroups,
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

  expect(drawDefinition.links.length).toEqual(playoffGroups.length);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  expect(mainStructure.structures.length).toEqual(groupsCount);
  expect(mainStructure.structures[0].positionAssignments.length).toEqual(4);

  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  expect(playoffStructures.length).toEqual(playoffGroups.length);
  expect(playoffStructures[0].positionAssignments.length).toEqual(16);

  const playoffStructureIds = new Set(playoffStructures.map((structure) => structure.structureId));

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.has(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const { drawId } = drawDefinition;
  const structure = drawDefinition.structures.find(({ structureId }) => structureId === mainStructure.structureId);
  const { matchUps: allStructureMatchUps } = getAllStructureMatchUps({
    inContext: true,
    structure,
  });
  const allStructureMatchUpsCount = allStructureMatchUps.length;
  const matchUpsPerStructure = allStructureMatchUpsCount / (drawSize / groupSize);
  mainStructure.structures.forEach((structure, structureOrder) => {
    const values = setsValues[0];
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp, matchUpIndex) => {
      const { matchUpId } = matchUp;
      const setValues: any = values?.[matchUpIndex];
      const outcome = generateMatchUpOutcome({
        matchUpFormat,
        setValues,
      });
      const result = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome,
      });
      expect(result.success).toEqual(true);

      ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
      const thisStructureIsCompleted = isCompletedStructure({
        drawDefinition,
        structureId: structure.structureId,
      });
      expect(thisStructureIsCompleted).toEqual(matchUpIndex + 1 === matchUpsPerStructure);

      const matchUpInstance = structureOrder * matchUpsPerStructure + (matchUpIndex + 1);
      const mainStructureIsCompleted = isCompletedStructure({
        drawDefinition,
        structureId: mainStructure.structureId,
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
    const finishingPositionGroup = structureFinishingPositions.flatMap(
      (finishingPosition) => finishingPositionGroups[finishingPosition],
    );
    const structureParticipantIds = updatedStructure?.positionAssignments
      ?.map((assignment) => assignment.participantId)
      .filter(Boolean);
    const expectedParticipantIds = intersection(structureParticipantIds, finishingPositionGroup);
    expect(expectedParticipantIds.length).toEqual(groupsCount * structureFinishingPositions.length);

    const positionAssignments = updatedStructure?.positionAssignments ?? [];
    const pairedPositions = chunkArray(positionAssignments, 2);
    const pairedParticipantIds = pairedPositions
      .map((positions) => positions.map((position) => position.participantId))
      .filter((pair) => pair.filter(Boolean).length === 2);

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
});
