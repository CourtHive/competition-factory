import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WITHDRAWN } from '@Constants/entryStatusConstants';
import { PARTICIPANT_ENTRY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

const flightEntries = (eventId) => tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights[0].drawEntries;
const eventEntries = (eventId) => tournamentEngine.getEvent({ eventId }).event.entries;
const drawEntries = (drawId) => tournamentEngine.getEvent({ drawId }).drawDefinition?.entries;
const entryOf = (entries, participantId) => entries.find((entry) => entry.participantId === participantId);

/**
 * One flight of 6 accepted entries plus 2 draw alternates; 2 event alternates that are not in the flight; 1
 * tournament participant not entered in the event at all.
 */
function scenario({ generate }: { generate: boolean }) {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 6, generate }],
    participantsProfile: { participantsCount: 11 },
    setState: true,
  });
  const acceptedIds = flightEntries(eventId).map(({ participantId }) => participantId);
  const otherIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !acceptedIds.includes(participantId));
  const drawAlternateIds = otherIds.slice(0, 2);
  const eventAlternateIds = otherIds.slice(2, 4);
  const notEnteredId = otherIds[4];

  let result: any = tournamentEngine.addEventEntries({
    participantIds: drawAlternateIds,
    entryStatus: ALTERNATE,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({ participantIds: eventAlternateIds, entryStatus: ALTERNATE, eventId });
  expect(result.success).toEqual(true);

  const flightIds = flightEntries(eventId).map(({ participantId }) => participantId);
  expect(flightIds).toEqual(expect.arrayContaining(drawAlternateIds));
  eventAlternateIds.forEach((participantId) => expect(flightIds).not.toContain(participantId));
  expect(entryOf(eventEntries(eventId), notEnteredId)).toBeUndefined();

  return { eventId, drawId, acceptedIds, drawAlternateIds, eventAlternateIds, notEnteredId };
}

// what TMX's "Move to Accepted" sends from a draw's entries view
const moveToAccepted = ({ eventId, drawId, participantIds }) =>
  tournamentEngine.modifyEntriesStatus({
    entryStatus: DIRECT_ACCEPTANCE,
    autoEntryPositions: true,
    entryStage: MAIN,
    participantIds,
    eventId,
    drawId,
  });

const snapshot = ({ eventId, drawId }) =>
  JSON.stringify({ event: eventEntries(eventId), flight: flightEntries(eventId), draw: drawEntries(drawId) });

describe('modifyEntriesStatus refuses participants outside its draw scope', () => {
  for (const generate of [false, true]) {
    const view = generate ? 'a generated draw' : 'a flight with no draw';

    it(`refuses an event alternate who is not in ${view}, and changes nothing`, () => {
      const { eventId, drawId, eventAlternateIds } = scenario({ generate });
      const before = snapshot({ eventId, drawId });

      let result: any = moveToAccepted({ eventId, drawId, participantIds: [eventAlternateIds[0]] });
      expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
      expect(result.context).toMatchObject({ participantIds: [eventAlternateIds[0]], drawId });
      expect(snapshot({ eventId, drawId })).toEqual(before);
    });

    it(`refuses the whole call when only some participants are in ${view}`, () => {
      const { eventId, drawId, drawAlternateIds, eventAlternateIds, notEnteredId } = scenario({ generate });
      const before = snapshot({ eventId, drawId });

      let result: any = moveToAccepted({
        participantIds: [drawAlternateIds[0], eventAlternateIds[1], notEnteredId],
        eventId,
        drawId,
      });
      expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
      expect(result.context.participantIds).toEqual([eventAlternateIds[1], notEnteredId]);
      expect(snapshot({ eventId, drawId })).toEqual(before);
      expect(entryOf(flightEntries(eventId), drawAlternateIds[0]).entryStatus).toEqual(ALTERNATE);
    });

    it(`moves the draw's own alternates in ${view}`, () => {
      const { eventId, drawId, drawAlternateIds } = scenario({ generate });

      let result: any = moveToAccepted({ eventId, drawId, participantIds: drawAlternateIds });
      expect(result.success).toEqual(true);
      drawAlternateIds.forEach((participantId) =>
        expect(entryOf(flightEntries(eventId), participantId).entryStatus).toEqual(DIRECT_ACCEPTANCE),
      );
      if (generate) {
        drawAlternateIds.forEach((participantId) =>
          expect(entryOf(drawEntries(drawId), participantId).entryStatus).toEqual(DIRECT_ACCEPTANCE),
        );
      }
    });
  }

  it('refuses a participant not entered in the event at all', () => {
    const { eventId, drawId, notEnteredId } = scenario({ generate: false });
    const before = snapshot({ eventId, drawId });

    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: [notEnteredId],
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
    expect(snapshot({ eventId, drawId })).toEqual(before);
  });

  it('WITHDRAWN with a drawId still withdraws an event entry that is not in the draw', () => {
    const { eventId, drawId, eventAlternateIds } = scenario({ generate: false });

    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: [eventAlternateIds[0]],
      entryStatus: WITHDRAWN,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(entryOf(eventEntries(eventId), eventAlternateIds[0]).entryStatus).toEqual(WITHDRAWN);
  });

  it('without a drawId, event entries are changed as before', () => {
    const { eventId, eventAlternateIds } = scenario({ generate: false });

    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: [eventAlternateIds[0]],
      entryStatus: DIRECT_ACCEPTANCE,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(entryOf(eventEntries(eventId), eventAlternateIds[0]).entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });
});
