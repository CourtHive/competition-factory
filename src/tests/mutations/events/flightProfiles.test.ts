import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DRAW_ID_EXISTS, EXISTING_PROFILE, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

it('can create and return flighProfiles', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  let { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  expect(flightProfile).toBeUndefined();

  let { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 3,
    eventId,
  }));
  expect(flightProfile.flights.length).toEqual(3);
  expect(flightProfile.flights.map(({ drawEntries }) => drawEntries.length)).toEqual([11, 11, 10]);
  expect(flightProfile.flights.map(({ drawName }) => drawName)).toEqual(['Flight 1', 'Flight 2', 'Flight 3']);
  expect(flightProfile.flights.every(({ drawId }) => drawId));

  result = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 4,
    eventId,
  });

  expect(result.error).toEqual(EXISTING_PROFILE);

  result = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    deleteExisting: true,
    flightsCount: 4,
    eventId,
  });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));

  expect(flightProfile.flights.length).toEqual(4);
  expect(flightProfile.flights.map(({ drawEntries }) => drawEntries.length)).toEqual([8, 8, 8, 8]);
  expect(flightProfile.flights.map(({ drawName }) => drawName)).toEqual([
    'Flight 1',
    'Flight 2',
    'Flight 3',
    'Flight 4',
  ]);
  expect(flightProfile.flights.every(({ drawId }) => drawId));
  ({ participants } = tournamentEngine.getParticipants({
    convertExtensions: true,
    withStatistics: true,
    withOpponents: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  }));

  expect(participants[0].draws.length).toBeGreaterThan(0);

  expect(flightProfile.flights.length).toEqual(4);
  const drawIds = flightProfile.flights.map(({ drawId }) => drawId);

  result = tournamentEngine.deleteFlightAndFlightDraw({
    drawId: drawIds[0],
    eventId,
  });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  expect(flightProfile.flights.length).toEqual(3);

  result = tournamentEngine.deleteFlightProfileAndFlightDraws({ eventId });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  expect(flightProfile).toBeUndefined();
});

it('can create and return flighProfiles with drawDefinitions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  let { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  expect(flightProfile).toBeUndefined();

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 3,
    eventId,
  }));

  flightProfile.flights?.forEach((flight) => {
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawId: flight.drawId,
      eventId,
    });
    result = tournamentEngine.addDrawDefinition({
      drawDefinition,
      eventId,
      flight,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addDrawDefinition({
      drawDefinition,
      eventId,
      flight,
    });
    expect(result.error).toEqual(DRAW_ID_EXISTS);
  });

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  expect(flightProfile.flights.every(({ drawDefinition }) => drawDefinition)).toEqual(true);
});

it('deleteFlightProfileAndFlightDraws returns MISSING_EVENT when no event', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  // calling without eventId should return MISSING_EVENT
  const result = tournamentEngine.deleteFlightProfileAndFlightDraws();
  expect(result.error).toEqual(MISSING_EVENT);
});

it('deleteFlightProfileAndFlightDraws succeeds when event has no flightProfile', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event No Flights';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  // no flight profile has been attached — should succeed via the fallback SUCCESS path
  result = tournamentEngine.deleteFlightProfileAndFlightDraws({ eventId });
  expect(result.success).toEqual(true);
});

it('deleteFlightProfileAndFlightDraws deletes flights with generated drawDefinitions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event With Draws';
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

  let { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 2,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(2);

  // generate and add drawDefinitions for each flight
  flightProfile.flights?.forEach((flight) => {
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawId: flight.drawId,
      eventId,
    });
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.success).toEqual(true);
  });

  let { event: updatedEvent } = tournamentEngine.getEvent({ eventId });
  expect(updatedEvent.drawDefinitions.length).toEqual(2);

  // delete all flights and their draw definitions
  result = tournamentEngine.deleteFlightProfileAndFlightDraws({ eventId });
  expect(result.success).toEqual(true);

  // confirm flightProfile is removed
  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  expect(flightProfile).toBeUndefined();

  // confirm drawDefinitions are removed
  ({ event: updatedEvent } = tournamentEngine.getEvent({ eventId }));
  expect(updatedEvent.drawDefinitions.length).toEqual(0);
});
