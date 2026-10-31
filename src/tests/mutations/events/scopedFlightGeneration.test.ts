import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { EXISTING_FLIGHT, EXISTING_PROFILE } from '@Constants/errorConditionConstants';
import { ENTRIES_SCOPE_UNFLIGHTED } from '@Constants/flightConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';

function flightedEvent(participantsCount = 16) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount } }],
    setState: true,
  });
  const entryIds: string[] = tournamentEngine.getEvent({ eventId }).event.entries.map(getParticipantId);
  return { eventId, entryIds };
}

const flights = (eventId: string) => tournamentEngine.getFlightProfile({ eventId }).flightProfile?.flights ?? [];
const idsOf = (flight: any) => flight.drawEntries.map(getParticipantId).sort();

function addFlightDraw(eventId: string, flight: any) {
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    drawEntries: flight.drawEntries,
    drawName: flight.drawName,
    drawId: flight.drawId,
    eventId,
  });
  const result: any = tournamentEngine.addDrawDefinition({ eventId, drawDefinition, flight });
  expect(result.success).toEqual(true);
}

it('splits only the chosen participants, or all but the excluded', () => {
  const { eventId, entryIds } = flightedEvent();

  let result: any = tournamentEngine.generateFlightProfile({
    eventId,
    flightsCount: 2,
    participantIds: entryIds.slice(0, 6),
  });
  expect(result.success).toEqual(true);
  expect(result.flightProfile.flights.flatMap(idsOf).sort()).toEqual(entryIds.slice(0, 6).sort());

  result = tournamentEngine.generateFlightProfile({
    eventId,
    flightsCount: 2,
    excludeParticipantIds: entryIds.slice(0, 6),
  });
  expect(result.success).toEqual(true);
  expect(result.flightProfile.flights.flatMap(idsOf).sort()).toEqual(entryIds.slice(6).sort());
});

it('appends flights for the participants a deleted flight freed, leaving the flighted draw untouched', () => {
  const { eventId, entryIds } = flightedEvent();
  let result: any = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 2, attachFlightProfile: true });
  expect(result.success).toEqual(true);
  const [first, second] = result.flightProfile.flights;
  addFlightDraw(eventId, first);
  result = tournamentEngine.deleteFlightAndFlightDraw({ eventId, drawId: second.drawId });
  expect(result.success).toEqual(true);

  // a replacing profile is still refused once a draw exists
  result = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 2, attachFlightProfile: true });
  expect(result.error).toEqual(EXISTING_PROFILE);

  result = tournamentEngine.generateFlightProfile({
    entriesScope: ENTRIES_SCOPE_UNFLIGHTED,
    attachFlightProfile: true,
    appendFlights: true,
    flightsCount: 2,
    eventId,
  });
  expect(result.success).toEqual(true);

  const [kept, ...appended] = flights(eventId);
  expect(kept.drawId).toEqual(first.drawId);
  expect(idsOf(kept)).toEqual(idsOf(first));
  expect(appended.map(({ flightNumber, drawName }) => [flightNumber, drawName])).toEqual([
    [2, 'Flight 2'],
    [3, 'Flight 3'],
  ]);
  expect(appended.flatMap(idsOf).sort()).toEqual(idsOf(second));
  expect(appended.flatMap(idsOf).sort()).toEqual(entryIds.filter((id) => !idsOf(first).includes(id)).sort());
  expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions.map(({ drawId }) => drawId)).toEqual([
    first.drawId,
  ]);
});

it('refuses to append a participant who is already in a flight', () => {
  const { eventId } = flightedEvent();
  let result: any = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 2, attachFlightProfile: true });
  expect(result.success).toEqual(true);
  const before = flights(eventId).map(({ drawId }) => drawId);

  result = tournamentEngine.generateFlightProfile({
    eventId,
    flightsCount: 1,
    attachFlightProfile: true,
    appendFlights: true,
  });
  expect(result.error).toEqual(EXISTING_FLIGHT);
  expect(result.context.participantIds.length).toEqual(16);
  expect(flights(eventId).map(({ drawId }) => drawId)).toEqual(before);
});

it('counts a draw stored without a flight as a flight, and gives it one when appending', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 16 }, drawProfiles: [{ drawSize: 8 }] }],
  });
  // a record stored without a profile: an ingested or older record
  const event = tournamentRecord.events[0];
  delete event.flightProfile;
  event.extensions = (event.extensions ?? []).filter(({ name }) => name !== FLIGHT_PROFILE);
  tournamentEngine.setState(tournamentRecord);
  const [{ drawId, entries }] = event.drawDefinitions;
  const drawParticipantIds = entries.map(getParticipantId);
  expect(flights(eventId)).toEqual([]);

  const result: any = tournamentEngine.generateFlightProfile({
    entriesScope: ENTRIES_SCOPE_UNFLIGHTED,
    attachFlightProfile: true,
    appendFlights: true,
    flightsCount: 1,
    eventId,
  });
  expect(result.success).toEqual(true);

  const [manual, appended] = flights(eventId);
  expect(manual).toMatchObject({ drawId, manuallyAdded: true, flightNumber: 1 });
  expect(idsOf(manual)).toEqual([...drawParticipantIds].sort());
  expect(appended.flightNumber).toEqual(2);
  expect(idsOf(appended).some((id) => drawParticipantIds.includes(id))).toEqual(false);
});
