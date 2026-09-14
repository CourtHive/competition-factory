import { tournamentEngine } from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

test('getEvents can hydrate', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { eventId: 'eventId1', drawId: 'drawId1', drawSize: 32, seedsCount: 8 },
      { eventId: 'eventId2', drawId: 'drawId2', drawSize: 16, seedsCount: 4 },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let events = tournamentEngine.getEvents().events;
  expect(events.length).toEqual(2);
  expect(events[0].tournamentId).toBeUndefined();

  events = tournamentEngine.getEvents({ inContext: true }).events;
  expect(events.length).toEqual(2);
  expect(events[0].tournamentId).not.toBeUndefined();
  events = tournamentEngine.getEvents({ eventIds: ['eventId1'] }).events;
  expect(events.length).toEqual(1);
  events = tournamentEngine.getEvents({ drawIds: ['drawId1'] }).events;
  expect(events.length).toEqual(1);
  const eventScaleValues = tournamentEngine.getEvents({
    withScaleValues: true,
  }).eventScaleValues;
  expect(eventScaleValues.eventId1).toEqual({
    draws: { drawId1: { ratingsStats: {}, ratings: {}, ranking: {} } },
    ratingsStats: {},
    ratings: {},
    ranking: {},
  });
});
