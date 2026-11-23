import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { ALTERNATE, WILDCARD } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import {
  ENTRY_STATUS_NOT_ALLOWED_IN_STAGE,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
} from '@Constants/errorConditionConstants';

/*
 * Entries added to an existing draw (addDrawEntries, and addEventEntries / addEventEntryPairs with a drawId) are
 * checked against the sanctioning constraints extension: a matched event's maxWildcards and maxAlternates bound
 * the WILDCARD and ALTERNATE entries of the draw stage. An event the extension does not match is unaffected.
 */

const SANCTIONED_EVENT_NAME = 'Sanctioned Singles';

// a draw of 8 holding 4 DIRECT_ACCEPTANCE entries, 8 more participants entered in the event only, and the rest in neither
function seedDraw({ sanctioned }: { sanctioned: boolean }) {
  const {
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 4, eventName: SANCTIONED_EVENT_NAME }],
    participantsProfile: { participantsCount: 24 },
    setState: true,
  });

  let result: any;
  if (sanctioned) {
    result = tournamentEngine.addTournamentExtension({
      extension: {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: [{ eventType: SINGLES_EVENT, maxWildcards: 2, maxAlternates: 2 }] },
      },
    });
    expect(result.success).toEqual(true);
  }

  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(event.eventType).toEqual(SINGLES_EVENT);
  expect(drawDefinition.entries.length).toEqual(4);

  const enteredIds = new Set(event.entries.map((e) => e.participantId));
  const freeIds = tournamentEngine
    .getParticipants()
    .participants.map((p) => p.participantId)
    .filter((id) => !enteredIds.has(id));
  expect(freeIds.length).toBeGreaterThanOrEqual(10);

  result = tournamentEngine.addEventEntries({ participantIds: freeIds.slice(0, 8), eventId });
  expect(result.success).toEqual(true);

  return { eventId, drawId, freeIds: freeIds.slice(0, 8), unenteredIds: freeIds.slice(8) };
}

function drawEntryCount(drawId: string, entryStatus: string) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return drawDefinition.entries.filter((e) => e.entryStatus === entryStatus).length;
}

describe('sanctioned maxWildcards bounds WILDCARD entries added to a draw', () => {
  it('admits two WILDCARD entries and refuses a third', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: true });

    let result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 2),
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(drawEntryCount(drawId, WILDCARD)).toEqual(2);

    result = tournamentEngine.addDrawEntries({
      participantIds: [freeIds[2]],
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(drawEntryCount(drawId, WILDCARD)).toEqual(2);
  });

  it('refuses one call adding three WILDCARD entries', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: true });

    const result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 3),
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE);
    expect(drawEntryCount(drawId, WILDCARD)).toEqual(0);
  });

  it('applies through addEventEntries with a drawId', () => {
    const { eventId, drawId, freeIds, unenteredIds } = seedDraw({ sanctioned: true });

    let result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 2),
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // a participant not yet in the event, entered in the event and the draw in one call
    const participantId = unenteredIds[0];
    result = tournamentEngine.addEventEntries({
      participantIds: [participantId],
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    // the event entry is made; the draw refuses it and returns the refusal as info
    expect(result.info).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(drawEntryCount(drawId, WILDCARD)).toEqual(2);
    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(event.entries.map((e) => e.participantId)).toContain(participantId);
    expect(drawDefinition.entries.map((e) => e.participantId)).not.toContain(participantId);
  });
});

describe('sanctioned maxAlternates bounds ALTERNATE entries added to a draw', () => {
  it('admits two ALTERNATE entries and refuses a third', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: true });

    let result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 2),
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(drawEntryCount(drawId, ALTERNATE)).toEqual(2);

    result = tournamentEngine.addDrawEntries({
      participantIds: [freeIds[2]],
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(ENTRY_STATUS_NOT_ALLOWED_IN_STAGE);
    expect(drawEntryCount(drawId, ALTERNATE)).toEqual(2);
  });

  it('refuses one call adding three ALTERNATE entries', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: true });

    const result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 3),
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE);
    expect(drawEntryCount(drawId, ALTERNATE)).toEqual(0);
  });
});

describe('an unsanctioned event is unaffected', () => {
  it('admits WILDCARD entries up to the open places and any number of ALTERNATE entries', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: false });

    let result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 3),
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(drawEntryCount(drawId, WILDCARD)).toEqual(3);

    result = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(3, 8),
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(drawEntryCount(drawId, ALTERNATE)).toEqual(5);
  });

  it('an event the sanctioning constraints do not match is unaffected', () => {
    const { eventId, drawId, freeIds } = seedDraw({ sanctioned: false });
    // constraints for DOUBLES only: the SINGLES event matches nothing
    let result: any = tournamentEngine.addTournamentExtension({
      extension: {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: [{ eventType: 'DOUBLES', maxWildcards: 0, maxAlternates: 0 }] },
      },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 3),
      entryStatus: WILDCARD,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(3, 6),
      entryStatus: ALTERNATE,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});
