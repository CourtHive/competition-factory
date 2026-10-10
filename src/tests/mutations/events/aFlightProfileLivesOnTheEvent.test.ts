import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import Ajv from 'ajv';
import fs from 'fs';

// constants and types
import type { DrawDefinition, Event } from '@Types/tournamentTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { RATING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

/**
 * A FLIGHT PROFILE LIVES ON THE EVENT, AND HAS A SHAPE.
 *
 * `event.flightProfile` was typed `any` and declared `{ "type": "object" }` in the schema, and `DrawDefinition` declared a
 * `flightProfile` that nothing ever wrote or read (0 of 49,929 production records, measured 2026-10-11). It is now the
 * `FlightProfile` type and a closed schema definition, matched against every key production records carry.
 *
 * Typing it surfaced two writers the closed shape refused: `generateFlightProfile` wrote a `seedNumber` onto the
 * event's own entry objects (no such field on `Entry`; nothing reads it; seeding is `seedAssignments`), and a draw added
 * without entries left its flight with no `drawEntries`, which `getEvents` maps over.
 */
const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addSchema(schema, 'tournament');
const validateRecord = ajv.compile({ $ref: 'tournament' });
const validateFlightProfile = ajv.compile({ $ref: 'tournament#/definitions/FlightProfile' });

function scaledEvent() {
  mocksEngine.generateTournamentRecord({ setState: true });
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'Flighted', eventType: SINGLES } });
  const participantIds = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map(({ participantId }) => participantId)
    .slice(0, 12);
  expect(tournamentEngine.addEventEntries({ eventId: event.eventId, participantIds }).success).toEqual(true);
  participantIds.forEach((participantId, index) => {
    const scaleItem = { scaleValue: index + 1, scaleName: 'NTRP', scaleType: RATING, eventType: SINGLES };
    expect(tournamentEngine.setParticipantScaleItem({ participantId, scaleItem }).success).toEqual(true);
  });
  // an entry that already carries a scaleValue is the condition under which seedNumber used to be written
  const { tournamentRecord } = tournamentEngine.getTournament();
  tournamentRecord.events[0].entries.forEach((entry, index) => (entry.scaleValue = index + 1));
  tournamentEngine.setState(tournamentRecord);
  return { eventId: event.eventId };
}

it('a scaled flight split writes no seedNumber, and the record validates', () => {
  const { eventId } = scaledEvent();
  const scaleAttributes = { scaleType: RATING, eventType: SINGLES, scaleName: 'NTRP', ascending: false };
  const result = tournamentEngine.generateFlightProfile({
    attachFlightProfile: true,
    scaleAttributes,
    flightsCount: 3,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord } = tournamentEngine.getTournament();
  const event = tournamentRecord.events[0];
  expect(event.flightProfile.flights).toHaveLength(3);
  const entriesWithSeedNumber = [
    ...event.entries,
    ...event.flightProfile.flights.flatMap((flight) => flight.drawEntries),
  ].filter((entry) => 'seedNumber' in entry);
  expect(entriesWithSeedNumber).toEqual([]);

  expect(validateFlightProfile(event.flightProfile), ajv.errorsText(validateFlightProfile.errors)).toEqual(true);
  expect(validateRecord(tournamentRecord), ajv.errorsText(validateRecord.errors)).toEqual(true);
});

it('a draw added without entries gives its flight an empty drawEntries array', () => {
  const event: Event = { eventId: 'e1', eventName: 'Manual', drawDefinitions: [] };
  const drawDefinition: DrawDefinition = { drawId: 'd1', drawName: 'Manual draw' };
  expect(addDrawDefinition({ drawDefinition, event }).success).toEqual(true);

  const { flightProfile } = getFlightProfile({ event });
  expect(flightProfile?.flights).toEqual([
    { manuallyAdded: true, flightNumber: 1, drawEntries: [], drawName: 'Manual draw', drawId: 'd1' },
  ]);
  expect(validateFlightProfile(flightProfile), ajv.errorsText(validateFlightProfile.errors)).toEqual(true);
});

it('a draw definition carries no flight profile of its own', () => {
  expect(schema.definitions.DrawDefinition.properties.flightProfile).toBeUndefined();
  expect(schema.definitions.Event.properties.flightProfile).toEqual({ $ref: '#/definitions/FlightProfile' });
});
