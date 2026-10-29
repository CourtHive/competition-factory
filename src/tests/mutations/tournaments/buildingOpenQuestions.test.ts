import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants
import { INVALID_PARTICIPANT_TYPE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * building-a-tournament.md § 8: a refusal writes nothing and creates no empty arrays, a named tieFormat's ids are built
 * from the event as stored, and a flight is the flight's own.
 */
const individual = (participantId: string) => ({
  person: { standardGivenName: 'A', standardFamilyName: participantId },
  participantRole: COMPETITOR,
  participantType: INDIVIDUAL,
  participantId,
});

const record = () => tournamentEngine.getTournament().tournamentRecord;

describe('a refused or empty call writes nothing', () => {
  test('addParticipants is all or nothing', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 4 }, setState: true });
    const before = record().participants.length;
    const invalid: any = { participantId: 'bad', participantType: 'NOT_A_TYPE', participantRole: COMPETITOR };
    const result: any = tournamentEngine.addParticipants({ participants: [individual('a'), invalid] });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
    // the individual appended before the refusal was kept, and never announced
    expect(record().participants.length).toEqual(before);
  });

  test('a refused call creates no empty participants or events', () => {
    tournamentEngine.newTournamentRecord();
    const invalid: any = { participantId: 'bad', participantType: 'NOT_A_TYPE', participantRole: COMPETITOR };
    expect(tournamentEngine.addParticipants({ participants: [individual('a'), invalid] }).error).toBeDefined();
    expect(record().participants).toBeUndefined();

    const refused: any = tournamentEngine.addEvent({ event: { eventName: 'E', entries: [{ participantId: 'a' }] } });
    expect(refused.error).toEqual(INVALID_VALUES);
    expect(record().events).toBeUndefined();

    // an accepted call that adds no one leaves the record holding an empty participants array, as generators expect
    expect(tournamentEngine.addParticipants({ participants: [] }).success).toEqual(true);
    expect(record().participants).toEqual([]);
  });
});

describe('addEvent builds a named tieFormat from the event as stored', () => {
  test("a mock event's collection ids carry its minted eventId", () => {
    tournamentEngine.newTournamentRecord();
    const result: any = tournamentEngine.addEvent({
      event: { eventType: TEAM_EVENT, tieFormatName: 'COLLEGE_DEFAULT', isMock: true },
    });
    expect(result.success).toEqual(true);
    const { eventId, tieFormat } = result.event;
    const collectionIds = tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
    expect(collectionIds.every((collectionId) => collectionId.startsWith(`${eventId}-COL-`))).toEqual(true);
  });

  test("a named tieFormat's collection ids come from the caller's uuids", () => {
    tournamentEngine.newTournamentRecord();
    const uuids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const result: any = tournamentEngine.addEvent({
      event: { eventType: TEAM_EVENT, tieFormatName: 'COLLEGE_DEFAULT' },
      uuids: [...uuids],
    });
    expect(result.success).toEqual(true);
    const collectionIds = result.event.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
    expect(collectionIds.every((collectionId) => uuids.includes(collectionId))).toEqual(true);
  });
});

describe('a flight is its own', () => {
  const drawFor = () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 8 } }],
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    const tournamentRecord = record();
    return { tournamentRecord, event: tournamentRecord.events[0], drawDefinition };
  };

  test("a new flight's drawEntries is a copy of the draw's entries", () => {
    const { tournamentRecord, event, drawDefinition } = drawFor();
    const result: any = addDrawDefinition({ tournamentRecord, event, drawDefinition });
    expect(result.success).toEqual(true);
    const flight = event.flightProfile.flights.find(({ drawId }) => drawId === drawDefinition.drawId);
    expect(flight.drawEntries).toEqual(drawDefinition.entries);
    drawDefinition.entries.pop();
    expect(flight.drawEntries.length).toEqual(drawDefinition.entries.length + 1);
  });

  test('a numeric string flightNumber is its number', () => {
    const { tournamentRecord, event, drawDefinition } = drawFor();
    const { drawId, entries: drawEntries } = drawDefinition;
    event.flightProfile = { flights: [{ drawId, flightNumber: '2' as any, drawEntries, drawName: 'F' }] };
    const result: any = addDrawDefinition({ tournamentRecord, event, drawDefinition });
    expect(result.success).toEqual(true);
    expect(drawDefinition.drawOrder).toEqual(2);
    expect(event.flightProfile.flights[0].flightNumber).toEqual(2);
  });
});
