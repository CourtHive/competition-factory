import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { allPlayoffPositionsFilled } from '@Query/drawDefinition/structureActions';
import { generateMatchUpOutcome } from '@Tests/helpers/generateMatchUpOutcome';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect } from 'vitest';

// constants and fixtures
import { MAIN, PLAY_OFF, POSITION, WATERFALL, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SINGLES_EVENT } from '@Constants/eventConstants';

export function roundRobinWithPlayoffsTest(params) {
  let groupsCount = params.groupsCount;
  const { finishingGroupSizes, participantsCount, playoffGroups, groupSize, drawSize } = params;
  groupsCount = groupsCount || drawSize / groupSize;
  const drawType = ROUND_ROBIN_WITH_PLAYOFF;
  const structureOptions = {
    playoffGroups,
    groupSize,
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: participantsCount || 32 },
  });
  const { participants } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const event = {
    eventName: 'Round Robin w/ Playoffs',
    eventType: SINGLES_EVENT,
  };

  let result = tournamentEngine.addEvent({ event });
  const { event: createdEvent, success } = result;
  const { eventId } = createdEvent;
  expect(success).toEqual(true);

  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const matchUpFormat = FORMAT_STANDARD;
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    seedingProfile: { positioning: WATERFALL },
    structureOptions,
    matchUpFormat,
    drawType,
    drawSize,
    eventId,
  });

  // the number of links should equal the number of playoff playoffGroups
  expect(drawDefinition.links.length).toEqual(playoffGroups.length);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  const mainStructure = drawDefinition.structures.find((structure) => structure.stage === MAIN);

  // the number of structureType: ITEM structures in the MAIN structureType: CONTAINER
  // should equal the number of groups
  expect(mainStructure.structures.length).toEqual(groupsCount);

  // the groupSize for each ITEM structure should be the same
  mainStructure.structures.forEach((structure) => {
    expect(structure.positionAssignments.length).toEqual(groupSize);
  });

  // itemdify all playoff structures by stage: PLAY_OFF
  const playoffStructures = drawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  // the number of playoff structures should equal the number of specified playoff groups
  expect(playoffStructures.length).toEqual(playoffGroups.length);

  // check that each group has the expected number of possition asignments
  playoffStructures.forEach((structure, index) => {
    expect(structure.positionAssignments.length).toEqual(playoffGroups[index].positionAssignmentsCount);
  });

  const playoffStructureIds = playoffStructures.map((structure) => structure.structureId);

  const positioningLinks = drawDefinition.links.filter((link) => link.linkType === POSITION);

  positioningLinks.forEach((link) => {
    expect(link.source.structureId).toEqual(mainStructure.structureId);
    const targetIsPlayoffStructure = playoffStructureIds.includes(link.target.structureId);
    expect(targetIsPlayoffStructure).toEqual(true);
  });

  const { drawId } = drawDefinition;

  // now complete all matchUps in the Round Robin (MAIN) structure
  mainStructure.structures.forEach((structure) => {
    const structureMatchUps = structure.matchUps;
    structureMatchUps.forEach((matchUp) => {
      const { matchUpId } = matchUp;
      if (matchUp.matchUpStatus !== 'BYE') {
        const setValues = [
          [6, 0],
          [6, 0],
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
      }
    });
  });

  const { matchUps: eventMatchUps } = tournamentEngine.allEventMatchUps({
    inContext: true,
    eventId,
  });

  const finishingPositionGroups = {};

  const orderValues = generateRange(1, groupSize + 1);
  mainStructure.structures.forEach((structure) => {
    const { structureId } = structure;

    const structureMatchUps = eventMatchUps.filter((matchUp) => matchUp.structureId === structureId);

    const { participantResults } = tallyParticipantResults({
      matchUps: structureMatchUps,
      matchUpFormat,
    });

    const structureParticipantIds = Object.keys(participantResults);

    structureParticipantIds.forEach((key) => {
      const { groupOrder } = participantResults[key];
      if (!finishingPositionGroups[groupOrder]) finishingPositionGroups[groupOrder] = [];
      finishingPositionGroups[groupOrder].push(key);
      expect(orderValues.includes(groupOrder)).toEqual(true);
    });
  });

  Object.keys(finishingPositionGroups).forEach((key, index) => {
    expect(finishingPositionGroups[key].length).toEqual(finishingGroupSizes[index]);
  });

  result = tournamentEngine.automatedPlayoffPositioning({
    structureId: mainStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  let { drawDefinition: updatedDrawDefinition } = tournamentEngine.findDrawDefinition({ drawId });

  const updatedPlayoffStructures = updatedDrawDefinition.structures.reduce((structures, structure) => {
    return structure.stage === PLAY_OFF ? structures.concat(structure) : structures;
  }, []);

  updatedPlayoffStructures.forEach((structure, index) => {
    const participantIds = structure.positionAssignments.map((assignment) => assignment.participantId).filter(Boolean);
    expect(participantIds.length).toEqual(playoffGroups[index].participantIdsCount);
    const byes = structure.positionAssignments.map((assignment) => assignment.bye).filter(Boolean);
    expect(byes.length).toEqual(playoffGroups[index].byesCount);
  });

  ({ drawDefinition: updatedDrawDefinition } = tournamentEngine.getEvent({
    drawId,
  }));
  const allPositionsFilled = allPlayoffPositionsFilled({
    structureId: mainStructure.structureId,
    drawDefinition: updatedDrawDefinition,
  });
  expect(allPositionsFilled).toEqual(true);

  return { drawDefinition: updatedDrawDefinition };
}
