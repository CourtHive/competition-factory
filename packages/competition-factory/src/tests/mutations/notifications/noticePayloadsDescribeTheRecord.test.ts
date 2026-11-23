import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { ADD_EVENT, MODIFY_EVENT } from '@Constants/topicConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { FEMALE } from '@Constants/genderConstants';

// A subscriber that persists from notices stores what the notice says. These pin notices whose
// payload described something other than the record: `addEvent` announced the caller's input
// (no minted eventId, the gender as given), and removing an entry from a flighted event changed
// the flight profile, which lives on the event, without announcing the event.

function subscribe(topic: string) {
  const payloads: any[] = [];
  setSubscriptions({ subscriptions: { [topic]: (delivered) => payloads.push(...delivered) } });
  return payloads;
}

afterEach(() => setSubscriptions({ subscriptions: {} }));

it('ADD_EVENT carries the event as stored: its minted eventId and normalised gender', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const added = subscribe(ADD_EVENT);

  const result: any = tournamentEngine.addEvent({ event: { eventName: 'Minted', gender: 'F' } });
  expect(result.success).toEqual(true);

  const stored = tournamentEngine.getEvent({ eventId: result.event.eventId }).event;
  expect(stored.gender).toEqual(FEMALE);
  expect(added).toHaveLength(1);
  expect(added[0].event.eventId).toEqual(stored.eventId);
  expect(added[0].event.gender).toEqual(stored.gender);
  expect(added[0].event.drawDefinitions).toBeUndefined();
});

it('removing an entry from a flighted event announces the event, whose flight profile changed', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Flighted' }],
    participantsProfile: { participantsCount: 16 },
    setState: true,
  });
  const { participants } = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } });
  const participantIds = participants.map(({ participantId }) => participantId);
  expect(tournamentEngine.addEventEntries({ eventId, participantIds }).success).toEqual(true);
  tournamentEngine.generateFlightProfile({ attachFlightProfile: true, flightsCount: 2, eventId });

  const modified = subscribe(MODIFY_EVENT);
  const result = tournamentEngine.removeEventEntries({ eventId, participantIds: [participantIds[0]] });
  expect(result.success).toEqual(true);

  const { flightProfile } = tournamentEngine.getFlightProfile({ eventId });
  const flightEntryIds = flightProfile.flights.flatMap(({ drawEntries }) => drawEntries.map((e) => e.participantId));
  expect(flightEntryIds).not.toContain(participantIds[0]);
  expect(modified.map(({ event }) => event.eventId)).toEqual([eventId]);
});
