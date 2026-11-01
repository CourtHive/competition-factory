import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, LUCKY_LOSER, WILDCARD, WITHDRAWN } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

const eventEntries = (eventId) => tournamentEngine.getEvent({ eventId }).event.entries;
const entryOf = (entries, participantId) => entries.find((entry) => entry.participantId === participantId);
const group = (entries, entryStatus, stage = MAIN) =>
  entries
    .filter((entry) => entry.entryStatus === entryStatus && (entry.entryStage ?? MAIN) === stage)
    .sort((a, b) => a.entryPosition - b.entryPosition)
    .map(({ participantId, entryPosition }) => [participantId, entryPosition]);

// an event of `accepted` positioned entries and `alternates` positioned alternates, with no draw
function eventWithAlternates({ accepted = 6, alternates = 3 } = {}) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: accepted } }],
    participantsProfile: { participantsCount: accepted + alternates },
    setState: true,
  });
  const acceptedIds = eventEntries(eventId).map(({ participantId }) => participantId);
  const alternateIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !acceptedIds.includes(participantId))
    .slice(0, alternates);
  let result: any = tournamentEngine.addEventEntries({ eventId, participantIds: alternateIds, entryStatus: ALTERNATE });
  expect(result.success).toEqual(true);
  result = tournamentEngine.setEntryPositions({
    entryPositions: alternateIds.map((participantId, index) => ({ participantId, entryPosition: index + 1 })),
    eventId,
  });
  expect(result.success).toEqual(true);
  expect(group(eventEntries(eventId), DIRECT_ACCEPTANCE).map(([, position]) => position)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(group(eventEntries(eventId), ALTERNATE).map(([, position]) => position)).toEqual([1, 2, 3]);
  return { eventId, acceptedIds, alternateIds };
}

// the parameters TMX's "Move to Accepted" sends
const moveToAccepted = (eventId, participantIds, params = {}) =>
  tournamentEngine.modifyEntriesStatus({
    entryStatus: DIRECT_ACCEPTANCE,
    autoEntryPositions: true,
    entryStage: MAIN,
    participantIds,
    eventId,
    ...params,
  });

describe('modifyEntriesStatus entryPositions across groups', () => {
  it('an alternate moved to accepted takes the next accepted position; the alternates close up', () => {
    const { eventId, acceptedIds, alternateIds } = eventWithAlternates();

    let result: any = moveToAccepted(eventId, [alternateIds[0]]);
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[0])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryPosition: 7 });
    expect(entryOf(entries, acceptedIds[0]).entryPosition).toEqual(1);
    expect(group(entries, ALTERNATE)).toEqual([
      [alternateIds[1], 1],
      [alternateIds[2], 2],
    ]);
  });

  it('several moved in one call take distinct positions in the order given', () => {
    const { eventId, alternateIds } = eventWithAlternates();

    let result: any = moveToAccepted(eventId, [alternateIds[2], alternateIds[0]]);
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[2]).entryPosition).toEqual(7);
    expect(entryOf(entries, alternateIds[0]).entryPosition).toEqual(8);
    expect(group(entries, ALTERNATE)).toEqual([[alternateIds[1], 1]]);
  });

  it('places and closes up without autoEntryPositions', () => {
    const { eventId, alternateIds } = eventWithAlternates();

    let result: any = moveToAccepted(eventId, [alternateIds[0]], { autoEntryPositions: false });
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[0])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryPosition: 7 });
    expect(group(entries, ALTERNATE)).toEqual([
      [alternateIds[1], 1],
      [alternateIds[2], 2],
    ]);
  });

  it('an accepted entry moved to ALTERNATE goes to the end of the alternates; the accepted close up', () => {
    const { eventId, acceptedIds, alternateIds } = eventWithAlternates();

    for (const autoEntryPositions of [true, false]) {
      const moved = autoEntryPositions ? acceptedIds[1] : acceptedIds[3];
      let result: any = tournamentEngine.modifyEntriesStatus({
        participantIds: [moved],
        entryStatus: ALTERNATE,
        autoEntryPositions,
        eventId,
      });
      expect(result.success).toEqual(true);
    }

    const entries = eventEntries(eventId);
    expect(group(entries, ALTERNATE)).toEqual([
      [alternateIds[0], 1],
      [alternateIds[1], 2],
      [alternateIds[2], 3],
      [acceptedIds[1], 4],
      [acceptedIds[3], 5],
    ]);
    expect(group(entries, DIRECT_ACCEPTANCE)).toEqual(
      [acceptedIds[0], acceptedIds[2], acceptedIds[4], acceptedIds[5]].map((id, index) => [id, index + 1]),
    );
  });

  it('a status the entry already has keeps its position', () => {
    const { eventId, acceptedIds } = eventWithAlternates();

    let result: any = moveToAccepted(eventId, [acceptedIds[0], acceptedIds[1]]);
    expect(result.success).toEqual(true);

    expect(group(eventEntries(eventId), DIRECT_ACCEPTANCE)).toEqual(acceptedIds.map((id, index) => [id, index + 1]));
  });

  it('a withdrawn entry restored to accepted, or to the alternates, goes to the end of that group', () => {
    const { eventId, acceptedIds, alternateIds } = eventWithAlternates();

    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: [acceptedIds[0], alternateIds[0]],
      entryStatus: WITHDRAWN,
      eventId,
    });
    expect(result.success).toEqual(true);
    let entries = eventEntries(eventId);
    expect(group(entries, DIRECT_ACCEPTANCE).map(([, position]) => position)).toEqual([1, 2, 3, 4, 5]);
    expect(group(entries, ALTERNATE).map(([, position]) => position)).toEqual([1, 2]);

    result = moveToAccepted(eventId, [acceptedIds[0]]);
    expect(result.success).toEqual(true);
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [alternateIds[0]],
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.success).toEqual(true);

    entries = eventEntries(eventId);
    expect(entryOf(entries, acceptedIds[0])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryPosition: 6 });
    expect(entryOf(entries, alternateIds[0])).toMatchObject({ entryStatus: ALTERNATE, entryPosition: 3 });
  });

  it('a qualifying alternate moved to the main accepted list takes the next main position', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: alternateIds.slice(0, 2),
      entryStage: QUALIFYING,
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(group(eventEntries(eventId), ALTERNATE, QUALIFYING).map(([, position]) => position)).toEqual([1, 2]);

    result = moveToAccepted(eventId, [alternateIds[0]]);
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[0])).toMatchObject({ entryStage: MAIN, entryPosition: 7 });
    expect(group(entries, ALTERNATE, QUALIFYING)).toEqual([[alternateIds[1], 1]]);
    expect(group(entries, ALTERNATE)).toEqual([[alternateIds[2], 1]]);
  });

  it('moves within a draw view: the draw and its flight place the entry after their accepted entries', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6, generate: false }],
      participantsProfile: { participantsCount: 9 },
      setState: true,
    });
    const flightEntries = () => tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights[0].drawEntries;
    const acceptedIds = flightEntries().map(({ participantId }) => participantId);
    const alternateIds = tournamentEngine
      .getParticipants()
      .participants.map(({ participantId }) => participantId)
      .filter((participantId) => !acceptedIds.includes(participantId));
    let result: any = tournamentEngine.addEventEntries({
      participantIds: alternateIds,
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(group(flightEntries(), ALTERNATE).map(([, position]) => position)).toEqual([1, 2, 3]);

    result = moveToAccepted(eventId, [alternateIds[1], alternateIds[0]], { drawId, autoEntryPositions: false });
    expect(result.success).toEqual(true);

    const entries = flightEntries();
    expect(group(entries, DIRECT_ACCEPTANCE).slice(-2)).toEqual([
      [alternateIds[1], 7],
      [alternateIds[0], 8],
    ]);
    expect(group(entries, ALTERNATE)).toEqual([[alternateIds[2], 1]]);
  });

  it('a draw alternate moved to LUCKY_LOSER joins the end of the one accepted list; the alternates close up', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6, generate: false }],
      participantsProfile: { participantsCount: 9 },
      setState: true,
    });
    const flightEntries = () => tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights[0].drawEntries;
    const acceptedIds = flightEntries().map(({ participantId }) => participantId);
    const alternateIds = tournamentEngine
      .getParticipants()
      .participants.map(({ participantId }) => participantId)
      .filter((participantId) => !acceptedIds.includes(participantId));
    let result: any = tournamentEngine.addEventEntries({
      participantIds: alternateIds,
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [alternateIds[0]],
      entryStatus: LUCKY_LOSER,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const entries = flightEntries();
    expect(group(entries, LUCKY_LOSER)).toEqual([[alternateIds[0], 7]]);
    expect(group(entries, ALTERNATE)).toEqual([
      [alternateIds[1], 1],
      [alternateIds[2], 2],
    ]);
    expect(group(entries, DIRECT_ACCEPTANCE).map(([, position]) => position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('numbers all accepted statuses as one list per stage, as refreshEntryPositions does', () => {
    const { eventId, acceptedIds, alternateIds } = eventWithAlternates();
    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: acceptedIds.slice(0, 2),
      entryStatus: WILDCARD,
      eventId,
    });
    expect(result.success).toEqual(true);

    result = moveToAccepted(eventId, [alternateIds[0]]);
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(group(entries, WILDCARD).map(([, position]) => position)).toEqual([1, 2]);
    expect(group(entries, DIRECT_ACCEPTANCE).map(([, position]) => position)).toEqual([3, 4, 5, 6, 7]);
    expect(entryOf(entries, alternateIds[0]).entryPosition).toEqual(7);
  });
});
