import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import {
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
} from '@Constants/errorConditionConstants';
import {
  CONFIRMED,
  DIRECT_ACCEPTANCE,
  JUNIOR_EXEMPT,
  LUCKY_LOSER,
  ORGANISER_ACCEPTANCE,
  QUALIFIER,
  SPECIAL_EXEMPT,
  WILDCARD,
} from '@Constants/entryStatusConstants';

/*
 * Entry into a draw counts every entry that takes a place left to direct entries: the direct-entry statuses
 * and LUCKY_LOSER. QUALIFIER entries count against the qualifier positions only. getEventEntrySpace counts
 * the same statuses, so what it reports open is what addDrawEntries allows.
 */

function seedFullDraw(entryStatus: string) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 8 }, setState: true });
  const {
    participants: [p1, p2, p3, p4, extra],
  } = tournamentEngine.getParticipants();

  let result: any = tournamentEngine.addEvent({ event: { eventName: 'Singles' } });
  const eventId = result.event.eventId;
  result = tournamentEngine.addEventEntries({
    participantIds: [p1, p2, p3, p4].map((p) => p.participantId),
    entryStatus,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 4 });
  expect(result.success).toEqual(true);
  const { drawDefinition } = result;
  expect(drawDefinition.entries.filter((e) => e.entryStatus === entryStatus).length).toEqual(4);
  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  // in the event, not yet in the draw
  result = tournamentEngine.addEventEntries({ participantIds: [extra.participantId], eventId });
  expect(result.success).toEqual(true);

  return { eventId, drawId: drawDefinition.drawId, extraId: extra.participantId };
}

describe('getStageSpace counts every entry that takes a direct-acceptance place', () => {
  it.each([SPECIAL_EXEMPT, ORGANISER_ACCEPTANCE, JUNIOR_EXEMPT, CONFIRMED, WILDCARD, DIRECT_ACCEPTANCE, LUCKY_LOSER])(
    'a draw full with %s entries refuses another entry',
    (entryStatus) => {
      const { eventId, drawId, extraId } = seedFullDraw(entryStatus);

      let result: any = tournamentEngine.getEventEntrySpace({ eventId, drawId });
      expect(result.openPlaces).toEqual(0);
      expect(result.acceptedCount).toEqual(4);

      result = tournamentEngine.addDrawEntries({ eventId, drawId, participantIds: [extraId] });
      expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      expect(drawDefinition.entries.map((e) => e.participantId)).not.toContain(extraId);
    },
  );
});

describe('QUALIFIER entries fill the qualifier positions, not the direct-acceptance places', () => {
  function seedQualifyingDraw(directEntriesCount = 6) {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          participantsCount: directEntriesCount,
          qualifyingProfiles: [{ structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }] }],
        },
      ],
      participantsProfile: { participantsCount: 20 },
      setState: true,
    });

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const mainEntries = drawDefinition.entries.filter((e) => e.entryStage === MAIN);
    const qualifyingEntries = drawDefinition.entries.filter((e) => e.entryStage === QUALIFYING);
    expect(mainEntries.filter((e) => e.entryStatus === DIRECT_ACCEPTANCE).length).toEqual(directEntriesCount);
    expect(qualifyingEntries.length).toBeGreaterThan(0);

    // participants entered in neither the event nor the draw
    const enteredIds = new Set((event.entries ?? []).map((e) => e.participantId));
    const { participants } = tournamentEngine.getParticipants();
    const freeIds = participants.map((p) => p.participantId).filter((id) => !enteredIds.has(id));
    expect(freeIds.length).toBeGreaterThanOrEqual(3);

    const result: any = tournamentEngine.addEventEntries({ participantIds: freeIds, eventId });
    expect(result.success).toEqual(true);

    return { drawId, eventId, freeIds };
  }

  it('admits QUALIFIER entries up to the qualifier positions when direct-acceptance places are full', () => {
    const { drawId, eventId, freeIds } = seedQualifyingDraw();

    let result: any = tournamentEngine.getEventEntrySpace({ eventId, drawId });
    expect(result).toMatchObject({ drawPositions: 8, qualifierPositions: 2, openPlaces: 0 });

    // the six direct-acceptance places are full
    result = tournamentEngine.addDrawEntries({ eventId, drawId, participantIds: [freeIds[0]] });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

    // three qualifiers for two qualifier positions
    result = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 3),
      entryStatus: QUALIFIER,
      entryStage: MAIN,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE);

    result = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 2),
      entryStatus: QUALIFIER,
      entryStage: MAIN,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // the qualifier positions are now full
    result = tournamentEngine.addDrawEntries({
      participantIds: [freeIds[2]],
      entryStatus: QUALIFIER,
      entryStage: MAIN,
      eventId,
      drawId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

    // and the qualifiers took nothing from the direct-acceptance places
    result = tournamentEngine.getEventEntrySpace({ eventId, drawId });
    expect(result).toMatchObject({ acceptedCount: 6, openPlaces: 0 });
  });

  it('QUALIFIER entries leave the direct-acceptance places open', () => {
    // four direct entries for six direct-acceptance places
    const { drawId, eventId, freeIds } = seedQualifyingDraw(4);

    let result: any = tournamentEngine.addDrawEntries({
      participantIds: freeIds.slice(0, 2),
      entryStatus: QUALIFIER,
      entryStage: MAIN,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getEventEntrySpace({ eventId, drawId });
    expect(result).toMatchObject({ acceptedCount: 4, openPlaces: 2 });

    result = tournamentEngine.addDrawEntries({ eventId, drawId, participantIds: [freeIds[2]] });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId, drawId });
    expect(result).toMatchObject({ acceptedCount: 5, openPlaces: 1 });
  });
});
