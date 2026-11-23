import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import { UUID } from '@Tools/UUID';

// constants and fixtures
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';

it('can generate draws in TEAM events with tieFormat and assign participants to collectionPositions', () => {
  const singlesCollectionId = UUID();
  const doublesCollectionId = UUID();
  const valueGoal = 4;
  const tieFormat = {
    winCriteria: { valueGoal },
    collectionDefinitions: [
      {
        collectionId: doublesCollectionId,
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        matchUpCount: 2,
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        matchUpValue: 1,
      },
      {
        collectionId: singlesCollectionId,
        collectionName: 'Singles',
        matchUpType: SINGLES,
        matchUpCount: 5,
        matchUpFormat: FORMAT_STANDARD,
        matchUpValue: 1,
      },
    ],
  };

  const drawSize = 8;
  const eventProfiles = [
    {
      eventType: TEAM,
      eventName: 'Test Team Event',
      tieFormat,
      drawProfiles: [
        {
          drawSize,
          tieFormat,
          drawName: 'Main Draw',
        },
      ],
    },
  ];

  const {
    eventIds: [eventId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles,
  });
  expect(eventId).not.toBeUndefined();
  expect(drawId).not.toBeUndefined();

  tournamentEngine.setState(tournamentRecord);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  expect(individualParticipants.length).toEqual(40);

  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  expect(pairParticipants.length).toEqual(20);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamParticipants.length).toEqual(drawSize);

  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(event.eventType).toEqual(TEAM);
  expect(drawDefinition.matchUpType).toEqual(undefined);
  expect(event.entries.length).toEqual(drawSize);
  expect(drawDefinition.entries.length).toEqual(drawSize);
  expect(event.tieFormat).toEqual(tieFormat);
  expect(drawDefinition.tieFormat).toBeUndefined();
});

it('can generate TEAM draws and use tieFormat and assign participants to collectionPositions', () => {
  const singlesCollectionId = UUID();
  const doublesCollectionId = UUID();
  const valueGoal = 4;
  const tieFormat = {
    winCriteria: { valueGoal },
    collectionDefinitions: [
      {
        collectionId: doublesCollectionId,
        collectionName: 'Doubles',
        matchUpType: DOUBLES,
        matchUpCount: 2,
        matchUpFormat: 'SET3-S:6/TB7-F:TB10',
        matchUpValue: 1,
      },
      {
        collectionId: singlesCollectionId,
        collectionName: 'Singles',
        matchUpType: SINGLES,
        matchUpCount: 5,
        matchUpFormat: FORMAT_STANDARD,
        matchUpValue: 1,
      },
    ],
  };

  const drawSize = 8;
  const drawName = 'Main Draw';
  const eventName = 'Custom Event';
  const drawProfiles = [
    {
      drawSize,
      tieFormat,
      eventType: TEAM,
      drawName,
      eventName,
    },
  ];

  const {
    eventIds: [eventId],
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  expect(eventId).not.toBeUndefined();
  expect(drawId).not.toBeUndefined();

  tournamentEngine.setState(tournamentRecord);

  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  expect(individualParticipants.length).toEqual(40);

  const { participants: pairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [PAIR] },
  });
  expect(pairParticipants.length).toEqual(20);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  expect(teamParticipants.length).toEqual(drawSize);

  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(event.eventType).toEqual(TEAM);
  expect(drawDefinition.matchUpType).toEqual(undefined);
  expect(event.entries.length).toEqual(drawSize);
  expect(drawDefinition.entries.length).toEqual(drawSize);
  expect(event.tieFormat).toEqual(tieFormat);
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.eventName).toEqual(eventName);
});
