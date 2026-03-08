import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { MISSING_DRAW_ID, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

it('can delete flight and flightDrawDefinition', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  let { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  ({ event: eventResult } = tournamentEngine.getEvent({ eventId }));
  expect(eventResult.entries.length).toEqual(participantIds.length);

  const flightsCount = 2;
  let { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(flightsCount);
  expect(flightProfile.flights[0].drawEntries.length).toEqual(participantIds.length / 2);

  flightProfile.flights?.forEach((flight) => {
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawName: flight.drawName,
      drawId: flight.drawId,
      eventId,
    });
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.success).toEqual(true);
  });

  const drawId = flightProfile.flights[0].drawId;

  result = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId });
  expect(result.success).toEqual(true);
  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  expect(flightProfile.flights.length).toEqual(flightsCount - 1);
});

it('can delete drawDefinition when there is no flight', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const eventName = 'Test Event';
  const event = { eventName };
  let result = tournamentEngine.setState(tournamentRecord).addEvent({ event });
  let { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({ eventId, participantIds });
  expect(result.success).toEqual(true);

  ({ event: eventResult } = tournamentEngine.getEvent({ eventId }));
  expect(eventResult.entries.length).toEqual(participantIds.length);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    eventId,
  });
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);
  ({ event: eventResult } = tournamentEngine.getEvent({ eventId }));
  expect(eventResult.drawDefinitions.length).toEqual(1);

  const { drawId } = drawDefinition;

  result = tournamentEngine.deleteFlightAndFlightDraw({ eventId });
  expect(result.error).toEqual(MISSING_DRAW_ID);
  result = tournamentEngine.deleteFlightAndFlightDraw({ drawId: 'bogusId' });
  expect(result.error).toEqual(MISSING_EVENT);
  result = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId });
  expect(result.success).toEqual(true);

  ({ event: eventResult } = tournamentEngine.getEvent({ eventId }));
  expect(eventResult.drawDefinitions.length).toEqual(0);
});

test('deleted flights will trigger refresh of drawOrder', () => {
  const mockProfile = {
    eventProfiles: [{ drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }, { drawSize: 4 }] }],
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  let { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  const drawId = flightProfile.flights.find((flight) => flight.flightNumber === 2).drawId;

  const result = tournamentEngine.deleteFlightAndFlightDraw({
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  const flightNumbers = flightProfile.flights.map(({ flightNumber }) => flightNumber);
  expect(flightNumbers).toEqual([1, 2]);
});

it('deleteFlightAndFlightDraw succeeds when drawId does not match any flight in flightProfile', () => {
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

  // attach a flight profile but don't generate draw definitions
  const { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 2,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(2);

  // use a bogus drawId that does not match any flight
  // the flight won't be found so the flightProfile won't be modified,
  // and the draw wasn't generated so drawWasGenerated is falsy — still succeeds
  result = tournamentEngine.deleteFlightAndFlightDraw({
    drawId: 'nonExistentDrawId',
    eventId,
  });
  expect(result.success).toEqual(true);

  // confirm flightProfile is unchanged
  const { flightProfile: updatedProfile } = tournamentEngine.getFlightProfile({ eventId });
  expect(updatedProfile.flights.length).toEqual(2);
});

it('deleteFlightAndFlightDraw handles flight profile with no generated draws', () => {
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

  // attach a flight profile
  const { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 2,
    eventId,
  });
  expect(flightProfile.flights.length).toEqual(2);

  const drawId = flightProfile.flights[0].drawId;

  // delete the flight WITHOUT having generated a drawDefinition
  // this exercises the path where flight is found and removed from flightProfile
  // but drawWasGenerated is falsy (no drawDefinitions on the event)
  result = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId });
  expect(result.success).toEqual(true);

  // confirm the flight was removed from the profile
  const { flightProfile: updatedProfile } = tournamentEngine.getFlightProfile({ eventId });
  expect(updatedProfile.flights.length).toEqual(1);
  expect(updatedProfile.flights[0].drawId).not.toEqual(drawId);
});
