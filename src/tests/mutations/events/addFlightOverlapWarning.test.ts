import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { PARTICIPANT_IN_OTHER_FLIGHT } from '@Constants/flightConstants';

// A participant given to a second flight is reported, not refused, until 8.0.0: `addFlight` still adds the flight and
// returns a PARTICIPANT_IN_OTHER_FLIGHT warning naming them. Every draw counts as a flight.

function flightedEvent() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 16 } }],
    setState: true,
  });
  const entries = tournamentEngine.getEvent({ eventId }).event.entries;
  const result: any = tournamentEngine.addFlight({ eventId, drawName: 'Flight 1', drawEntries: entries.slice(0, 8) });
  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
  return { eventId, entries };
}

const flightNames = (eventId: string) =>
  tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights.map(({ drawName }) => drawName);

it('adds a flight with an overlapping participant and warns about them', () => {
  const { eventId, entries } = flightedEvent();
  const drawEntries = [...entries.slice(6, 8), ...entries.slice(8, 12)];

  const result: any = tournamentEngine.addFlight({ eventId, drawName: 'Flight 2', drawEntries });

  expect(result.success).toEqual(true);
  expect(flightNames(eventId)).toEqual(['Flight 1', 'Flight 2']);
  expect(result.warnings).toEqual([
    { code: PARTICIPANT_IN_OTHER_FLIGHT, info: { participantIds: entries.slice(6, 8).map(getParticipantId) } },
  ]);
});

it('a flight of participants in no other flight carries no warning', () => {
  const { eventId, entries } = flightedEvent();

  const result: any = tournamentEngine.addFlight({ eventId, drawName: 'Flight 2', drawEntries: entries.slice(8) });

  expect(result.success).toEqual(true);
  expect(result.warnings).toBeUndefined();
});

it("a draw's participants count as placed", () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 16 }, drawProfiles: [{ drawSize: 8 }] }],
    setState: true,
  });
  const { event } = tournamentEngine.getEvent({ eventId });
  const inDraw = event.drawDefinitions[0].entries.map(getParticipantId);
  const drawEntries = event.entries.filter(({ participantId }) => inDraw.includes(participantId)).slice(0, 2);

  const result: any = tournamentEngine.addFlight({ eventId, drawName: 'Late flight', drawEntries });

  expect(result.success).toEqual(true);
  expect(result.warnings?.[0]?.info?.participantIds).toEqual(drawEntries.map(getParticipantId));
});
