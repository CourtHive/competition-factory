import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

test('getEvents with no tournamentRecord returns error', () => {
  const result = tournamentEngine.getEvents({});
  expect(result.error).toBeDefined();
});

test('getEvents with inContext adds tournamentId', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { events } = tournamentEngine.getEvents({ inContext: true });
  expect(events.length).toBeGreaterThan(0);
  expect(events[0].tournamentId).toBeDefined();
});

test('getEvents with context adds custom properties', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { events } = tournamentEngine.getEvents({
    context: { customProp: 'customValue' },
  });
  expect(events[0].customProp).toBe('customValue');
});

test('getEvents filters by eventIds', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ drawProfiles: [{ drawSize: 4 }] }, { drawProfiles: [{ drawSize: 4 }] }],
    setState: true,
  });

  const { events } = tournamentEngine.getEvents({ eventIds: [eventId] });
  expect(events.length).toBe(1);
  expect(events[0].eventId).toBe(eventId);
});

test('getEvents filters by drawIds', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { events } = tournamentEngine.getEvents({ drawIds: [drawId] });
  expect(events.length).toBe(1);
});

test('getEvents with withScaleValues', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const { events, eventScaleValues } = tournamentEngine.getEvents({
    withScaleValues: true,
  });
  expect(events.length).toBeGreaterThan(0);
  expect(eventScaleValues).toBeDefined();
});

test('getEvents withScaleValues and DOUBLES event', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
    participantsProfile: {
      scaledParticipantsCount: 16,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const { events, eventScaleValues } = tournamentEngine.getEvents({
    withScaleValues: true,
  });
  expect(events.length).toBeGreaterThan(0);
  expect(eventScaleValues).toBeDefined();
});

test('getEvents withScaleValues and scaleEventType', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    participantsProfile: {
      scaledParticipantsCount: 8,
      scaleAllParticipants: true,
    },
    setState: true,
  });

  const { eventScaleValues } = tournamentEngine.getEvents({
    scaleEventType: SINGLES,
    withScaleValues: true,
  });
  expect(eventScaleValues).toBeDefined();
});

test('getEvents drawIds filter excludes events without matching draws', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { events } = tournamentEngine.getEvents({ drawIds: ['nonexistent-draw'] });
  expect(events.length).toBe(0);
});
