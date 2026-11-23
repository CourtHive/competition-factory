import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

const eventEntries = (eventId) => tournamentEngine.getEvent({ eventId }).event.entries;
const ordinals = (eventId, params = {}) =>
  tournamentEngine
    .getEntryStatusOrdinals({ entries: eventEntries(eventId), ...params })
    .statusOrdinals.map(({ participantId, entryStatus, entryPosition, statusOrdinal }) => [
      participantId,
      entryStatus,
      entryPosition,
      statusOrdinal,
    ]);

// 6 accepted entries, two of them (the 2nd and 5th) made WILDCARD, and 3 positioned alternates
function interleavedEvent() {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 6 } }],
    participantsProfile: { participantsCount: 9 },
    setState: true,
  });
  const acceptedIds = eventEntries(eventId).map(({ participantId }) => participantId);
  const alternateIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !acceptedIds.includes(participantId))
    .slice(0, 3);
  let result: any = tournamentEngine.addEventEntries({ eventId, participantIds: alternateIds, entryStatus: ALTERNATE });
  expect(result.success).toEqual(true);
  result = tournamentEngine.setEntryPositions({
    entryPositions: alternateIds.map((participantId, index) => ({ participantId, entryPosition: index + 1 })),
    eventId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.modifyEntriesStatus({
    participantIds: [acceptedIds[4], acceptedIds[1]],
    entryStatus: WILDCARD,
    eventId,
  });
  expect(result.success).toEqual(true);
  return { eventId, acceptedIds, alternateIds };
}

describe('getEntryStatusOrdinals', () => {
  it('numbers each status in acceptance order from the one accepted list', () => {
    const { eventId, acceptedIds } = interleavedEvent();

    expect(ordinals(eventId, { entryStatus: WILDCARD })).toEqual([
      [acceptedIds[1], WILDCARD, 2, 1],
      [acceptedIds[4], WILDCARD, 5, 2],
    ]);
    expect(ordinals(eventId, { entryStatus: DIRECT_ACCEPTANCE })).toEqual([
      [acceptedIds[0], DIRECT_ACCEPTANCE, 1, 1],
      [acceptedIds[2], DIRECT_ACCEPTANCE, 3, 2],
      [acceptedIds[3], DIRECT_ACCEPTANCE, 4, 3],
      [acceptedIds[5], DIRECT_ACCEPTANCE, 6, 4],
    ]);
  });

  it('stays correct after alternates are moved into the accepted list', () => {
    const { eventId, acceptedIds, alternateIds } = interleavedEvent();

    let result: any = tournamentEngine.modifyEntriesStatus({
      participantIds: [alternateIds[1]],
      entryStatus: WILDCARD,
      autoEntryPositions: true,
      eventId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.modifyEntriesStatus({
      participantIds: [alternateIds[0]],
      entryStatus: DIRECT_ACCEPTANCE,
      autoEntryPositions: true,
      eventId,
    });
    expect(result.success).toEqual(true);

    expect(ordinals(eventId, { entryStatus: WILDCARD })).toEqual([
      [acceptedIds[1], WILDCARD, 2, 1],
      [acceptedIds[4], WILDCARD, 5, 2],
      [alternateIds[1], WILDCARD, 7, 3],
    ]);
    expect(ordinals(eventId, { entryStatus: DIRECT_ACCEPTANCE }).at(-1)).toEqual([
      alternateIds[0],
      DIRECT_ACCEPTANCE,
      8,
      5,
    ]);
    expect(ordinals(eventId, { entryStatus: ALTERNATE })).toEqual([[alternateIds[2], ALTERNATE, 1, 1]]);
  });

  it('numbers every stage and status when unfiltered; unpositioned entries follow in array order', () => {
    const entries = [
      { participantId: 'q2', entryStage: QUALIFYING, entryStatus: DIRECT_ACCEPTANCE },
      { participantId: 'w2', entryStatus: WILDCARD, entryPosition: 4 },
      { participantId: 'd1', entryStage: MAIN, entryStatus: DIRECT_ACCEPTANCE, entryPosition: 1 },
      { participantId: 'w1', entryStatus: WILDCARD, entryPosition: 2 },
      { participantId: 'w3', entryStatus: WILDCARD },
      { participantId: 'q1', entryStage: QUALIFYING, entryStatus: DIRECT_ACCEPTANCE, entryPosition: 1 },
      { participantId: 'w4', entryStatus: WILDCARD },
    ];
    const result: any = tournamentEngine.getEntryStatusOrdinals({ entries });
    const byId = Object.fromEntries(
      result.statusOrdinals.map(({ participantId, entryStage, statusOrdinal }) => [
        participantId,
        [entryStage, statusOrdinal],
      ]),
    );
    expect(byId).toEqual({
      q1: [QUALIFYING, 1],
      q2: [QUALIFYING, 2],
      w1: [MAIN, 1],
      w2: [MAIN, 2],
      w3: [MAIN, 3],
      w4: [MAIN, 4],
      d1: [MAIN, 1],
    });

    const qualifying: any = tournamentEngine.getEntryStatusOrdinals({ entries, stage: QUALIFYING });
    expect(qualifying.statusOrdinals.map(({ participantId }) => participantId)).toEqual(['q1', 'q2']);
    expect(tournamentEngine.getEntryStatusOrdinals({ entries: undefined }).statusOrdinals).toEqual([]);
  });
});
