import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { ensureInt } from '@Tools/ensureInt';
import { expect, it } from 'vitest';

// constants
import { SPLIT_LEVEL_BASED, SPLIT_SHUTTLE, SPLIT_WATERFALL } from '@Constants/flightConstants';
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { RANKING, RATING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';
import { NTRP } from '@Constants/ratingConstants';

// turn on devContext to enable checking splitEntries value
tournamentEngine.devContext(true);

it('can sort entries by scaleAttributes when generatingflighProfiles', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const scaleValues = [5, 4, 3, 2, 1, 10, 9, 8, 7, 6, 15, 14, 13, 12, 11];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleValue,
      scaleName: NTRP,
      scaleType: RATING,
      eventType: SINGLES,
      scaleDate: '2020-06-06',
    };
    const participantId = participantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  const scaleAttributes = {
    scaleType: RATING,
    eventType: SINGLES,
    scaleName: NTRP,
  };
  participantIds.forEach((participantId, index) => {
    const { scaleItem } = tournamentEngine.getParticipantScaleItem({
      participantId,
      scaleAttributes,
    });
    if (scaleValues[index]) expect(scaleItem.scaleValue).toEqual(scaleValues[index]);
  });

  let { flightProfile, splitEntries } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    scaleAttributes,
    flightsCount: 3,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(3);
  expect(splitEntries[0].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  ]);
  expect(splitEntries[1].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([12, 13, 14, 15]);
  expect(splitEntries[2].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([]);

  ({ flightProfile, splitEntries } = tournamentEngine.generateFlightProfile({
    splitMethod: SPLIT_LEVEL_BASED,
    attachFlightProfile: true,
    deleteExisting: true,
    scaleAttributes,
    flightsCount: 3,
    eventId,
  }));
  expect(flightProfile.flights.length).toEqual(3);
  expect(splitEntries[0].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  ]);
  expect(splitEntries[1].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([12, 13, 14, 15]);
  expect(splitEntries[2].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([]);

  ({ flightProfile, splitEntries } = tournamentEngine.generateFlightProfile({
    splitMethod: SPLIT_WATERFALL,
    attachFlightProfile: true,
    deleteExisting: true,
    flightsCount: 3,
    scaleAttributes,
    eventId,
  }));
  expect(flightProfile.flights.length).toEqual(3);
  expect(splitEntries[0].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([1, 4, 7, 10, 13]);
  expect(splitEntries[1].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([2, 5, 8, 11, 14]);
  expect(splitEntries[2].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([3, 6, 9, 12, 15]);

  ({ flightProfile, splitEntries } = tournamentEngine.generateFlightProfile({
    splitMethod: SPLIT_SHUTTLE,
    attachFlightProfile: true,
    deleteExisting: true,
    flightsCount: 3,
    scaleAttributes,
    eventId,
  }));
  expect(flightProfile.flights.length).toEqual(3);
  expect(splitEntries[0].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([1, 6, 7, 12, 13]);
  expect(splitEntries[1].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([2, 5, 8, 11, 14]);
  expect(splitEntries[2].map(({ scaleValue }) => scaleValue).filter(Boolean)).toEqual([3, 4, 9, 10, 15]);

  // no drawDefinitions were ever generated, so expect attempts to delete them to throw errors
  result = tournamentEngine.deleteFlightProfileAndFlightDraws();
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.deleteFlightProfileAndFlightDraws({ eventId });
  expect(result.success).toEqual(true);
});

it('can delete flightProfileAndFlightDraw', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });

  tournamentEngine.setState(tournamentRecord);
  const result = tournamentEngine.deleteFlightProfileAndFlightDraws({
    eventId,
  });
  expect(result.success).toEqual(true);
});

it('will randomly sort unranked participants when creating flights', () => {
  const scaledParticipantsCount = 28;
  const participantsCount = 48;
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Flighting ' }],
    participantsProfile: {
      category: { ageCategoryCode: '18U' },
      scaledParticipantsCount,
      participantsCount,
    },
  });

  tournamentEngine.setState(tournamentRecord);
  const { participants } = tournamentEngine.getParticipants({
    withScaleValues: true,
  });
  expect(participants.length).toEqual(participantsCount);

  const scaledParticipants = participants.filter((p) => p.rankings?.SINGLES);
  expect(scaledParticipants.length).toEqual(scaledParticipantsCount);

  const { participants: tournamentParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = tournamentParticipants.map((p) => p.participantId);
  const result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  const scaleAttributes = {
    scaleType: RANKING,
    eventType: SINGLES,
    scaleName: '18U',
  };
  const { flightProfile, splitEntries } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    scaleAttributes,
    flightsCount: 3,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(3);
  const entryPositions = splitEntries[2].map((e) => ensureInt(e.entryPosition));
  const nonSequential = entryPositions.some((entryPosition, i) => entryPosition > entryPositions[i + 1]);
  expect(nonSequential).toBeTruthy();
});
