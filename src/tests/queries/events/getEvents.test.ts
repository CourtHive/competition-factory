import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { defined } from '@Tests/helpers/defined';
import { expect, test } from 'vitest';

test('getEvents can hydrate', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { eventId: 'eventId1', drawId: 'drawId1', drawSize: 32, seedsCount: 8 },
      { eventId: 'eventId2', drawId: 'drawId2', drawSize: 16, seedsCount: 4 },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let events = defined(tournamentEngine.getEvents().events, 'events');
  expect(events.length).toEqual(2);
  expect(events[0]).not.toHaveProperty('tournamentId');

  events = defined(tournamentEngine.getEvents({ inContext: true }).events, 'events');
  expect(events.length).toEqual(2);
  expect(events[0]).toHaveProperty('tournamentId', tournamentRecord.tournamentId);
  events = defined(tournamentEngine.getEvents({ eventIds: ['eventId1'] }).events, 'events');
  expect(events.length).toEqual(1);
  events = defined(tournamentEngine.getEvents({ drawIds: ['drawId1'] }).events, 'events');
  expect(events.length).toEqual(1);
  const eventScaleValues = tournamentEngine.getEvents({
    withScaleValues: true,
  }).eventScaleValues;
  expect(eventScaleValues?.eventId1).toEqual({
    draws: { drawId1: { ratingsStats: {}, ratings: {}, ranking: {} } },
    ratingsStats: {},
    ratings: {},
    ranking: {},
  });
});
