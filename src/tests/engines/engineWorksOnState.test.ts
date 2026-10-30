import { addEventEntries } from '@Mutate/entries/addEventEntries';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants
import {
  DRAW_DEFINITION_NOT_FOUND,
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

/**
 * An engine call works only on the records the engine holds (CA 2026-10-30: a write never silently goes nowhere;
 * building-a-tournament.md §1.3). An object passed in is resolved to the one in state by its own id; one not held is
 * refused; an object and an id that name different entities are refused, with the engine or without it.
 */
function loaded() {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 20 },
    drawProfiles: [{ drawSize: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const stored = () => tournamentEngine.getEvent({ eventId }).event;
  const unentered = tournamentRecord.participants
    .map(({ participantId }) => participantId)
    .find((participantId) => !stored().entries.some((entry) => entry.participantId === participantId));
  return { tournamentRecord, eventId, drawId, stored, unentered };
}

describe('through the engine, a passed object is resolved to the one in state', () => {
  test('entries added through a copy of the event land in the stored event, not the copy', () => {
    const { stored, unentered } = loaded();
    const copy = structuredClone(stored());
    const before = stored().entries.length;
    const result: any = tournamentEngine.addEventEntries({ event: copy, participantIds: [unentered] });
    expect(result.success).toEqual(true);
    expect(stored().entries.length).toEqual(before + 1);
    expect(copy.entries.length).toEqual(before);
  });

  test('a write through a copy of the tournament record lands in the record in state', () => {
    loaded();
    const copy = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const result: any = tournamentEngine.setTournamentName({ tournamentRecord: copy, tournamentName: 'Renamed' });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getTournament().tournamentRecord.tournamentName).toEqual('Renamed');
    expect(copy.tournamentName).not.toEqual('Renamed');
  });

  test('a read through a copy of a draw reads the draw in state', () => {
    const { drawId } = loaded();
    const copy = structuredClone(tournamentEngine.getEvent({ drawId }).drawDefinition);
    copy.structures = [];
    const result: any = tournamentEngine.getAllDrawMatchUps({ drawDefinition: copy });
    expect(result.matchUps.length).toEqual(7);
  });
});

describe('through the engine, an object that is not held is refused', () => {
  test('an event, a draw and a tournament record that are not in state', () => {
    const { unentered } = loaded();
    let result: any = tournamentEngine.addEventEntries({
      event: { eventId: 'not-held', eventType: 'SINGLES', entries: [] },
      participantIds: [unentered],
    });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
    result = tournamentEngine.getAllDrawMatchUps({ drawDefinition: { drawId: 'not-held', structures: [] } });
    expect(result.error).toEqual(DRAW_DEFINITION_NOT_FOUND);
    const { tournamentRecord: other } = mocksEngine.generateTournamentRecord();
    result = tournamentEngine.setTournamentName({ tournamentRecord: other, tournamentName: 'Other' });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    expect(other.tournamentName).not.toEqual('Other');
  });

  test('an event with no eventId cannot be resolved, and is refused', () => {
    const { unentered } = loaded();
    const result: any = tournamentEngine.addEventEntries({ event: { entries: [] }, participantIds: [unentered] });
    expect(result.error).toEqual(EVENT_NOT_FOUND);
  });
});

describe('an object and an id that name different entities are refused', () => {
  test('through the engine', () => {
    const { stored, unentered } = loaded();
    const result: any = tournamentEngine.addEventEntries({
      event: stored(),
      eventId: 'another',
      participantIds: [unentered],
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  test('without the engine', () => {
    const { tournamentRecord, stored, unentered } = loaded();
    const event = tournamentRecord.events[0];
    const before = event.entries.length;
    // an untyped caller can pass both (the typed params name only the event)
    let result: any = addEventEntries({
      tournamentRecord,
      event,
      eventId: 'another',
      participantIds: [unentered],
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(event.entries.length).toEqual(before);

    // CONTROL: the matching eventId, without the engine, writes to the event it is given
    result = addEventEntries({ tournamentRecord, event, eventId: event.eventId, participantIds: [unentered] } as any);
    expect(result.success).toEqual(true);
    expect(event.entries.length).toEqual(before + 1);
    expect(stored().entries.length).toEqual(before);
  });
});

describe('a creation payload is not resolved', () => {
  test('addEvent takes an event that is not yet in state', () => {
    loaded();
    const result: any = tournamentEngine.addEvent({ event: { eventId: 'new-event', eventName: 'New' } });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getEvent({ eventId: 'new-event' }).event.eventName).toEqual('New');
  });
});
