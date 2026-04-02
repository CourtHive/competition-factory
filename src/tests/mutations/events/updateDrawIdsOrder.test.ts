import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { INDIVIDUAL } from '@Constants/participantConstants';
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

it('can modify the drawOrder of flightProfile.flights and drawDefniitions within an event', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({});
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

  let { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 3,
    eventId,
  });

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
  const existingOrder = updatedEvent.drawDefinitions.map(({ drawOrder }) => drawOrder);
  expect(existingOrder).toEqual([1, 2, 3]);

  const drawIds = updatedEvent.drawDefinitions.map(({ drawId }) => drawId);
  const newOrder = [3, 1, 2];
  let orderedDrawIdsMap = Object.assign({}, ...drawIds.map((drawId, i) => ({ [drawId]: newOrder[i] })));

  result = tournamentEngine.updateDrawIdsOrder({ eventId });
  expect(result.error).toEqual(MISSING_VALUE);

  result = tournamentEngine.updateDrawIdsOrder({
    eventId,
    orderedDrawIdsMap: 'not an object',
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.success).toEqual(true);

  ({ event: updatedEvent } = tournamentEngine.getEvent({ eventId }));
  const drawOrders = updatedEvent.drawDefinitions.map(({ drawOrder }) => drawOrder);
  expect(drawOrders).toEqual(newOrder);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  const flightNumbers = flightProfile.flights.map(({ flightNumber }) => flightNumber);
  expect(flightNumbers).toEqual(newOrder);

  orderedDrawIdsMap = Object.assign({}, ...drawIds.map((drawId) => ({ [drawId]: 'NaN' })));
  result = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.error).toEqual(INVALID_VALUES);

  const notUnique = [0, 0, 1, 1];
  orderedDrawIdsMap = Object.assign({}, ...drawIds.map((drawId, i) => ({ [drawId]: notUnique[i] })));
  result = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.error).toEqual(INVALID_VALUES);

  Object.assign({}, ...drawIds.map((_, i) => ({ ['bogusId']: newOrder[i] })));
  expect(result.error).toEqual(INVALID_VALUES);
});

it('can modify the drawOrder of flightProfile.flights', () => {
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

  let { flightProfile } = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    flightsCount: 3,
    eventId,
  });

  const existingOrder = flightProfile.flights.map(({ flightNumber }) => flightNumber);
  expect(existingOrder).toEqual([1, 2, 3]);

  const drawIds = flightProfile.flights.map(({ drawId }) => drawId);
  const newOrder = [3, 1, 2];
  const orderedDrawIdsMap = Object.assign({}, ...drawIds.map((drawId, i) => ({ [drawId]: newOrder[i] })));
  result = tournamentEngine.updateDrawIdsOrder({ eventId, orderedDrawIdsMap });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  let flightNumbers = flightProfile.flights.map(({ flightNumber }) => flightNumber);
  expect(flightNumbers).toEqual(newOrder);

  result = tournamentEngine.refreshEventDrawOrder({ eventId });
  expect(result.success).toEqual(true);

  ({ flightProfile } = tournamentEngine.getFlightProfile({ eventId }));
  flightNumbers = flightProfile.flights.map(({ flightNumber }) => flightNumber);
  expect(flightNumbers).toEqual([1, 2, 3]);
});
