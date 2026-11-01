import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, WILDCARD, WITHDRAWN } from '@Constants/entryStatusConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/*
 * getEventEntrySpace: how many MAIN places an event has for entries accepted directly, and how many are open.
 * Before a draw, the event's entryProfile states the sizes; after, the generated structure does.
 */

function seedEvent({ accepted = 20, spare = 4 } = {}) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventType: SINGLES_EVENT, participantsProfile: { participantsCount: accepted } }],
    participantsProfile: { participantsCount: accepted + spare },
    setState: true,
  });
  const event = tournamentEngine.getEvent({ eventId }).event;
  const entered = event.entries.map(({ participantId }) => participantId);
  const spareIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !entered.includes(participantId))
    .slice(0, spare);
  return { eventId, entered, spareIds };
}

const setEntryProfile = (eventId: string, entryProfile: any) => {
  const result: any = tournamentEngine.modifyEvent({ eventId, eventUpdates: { entryProfile } });
  expect(result.success).toEqual(true);
};

describe('getEventEntrySpace before a draw', () => {
  it('states no places when nothing gives a draw size, but still counts the entries', () => {
    const { eventId } = seedEvent();
    const result: any = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({
      success: true,
      basis: 'NONE',
      drawPositions: 0,
      qualifierPositions: 0,
      qualifierPositionsBasis: 'NONE',
      directAcceptedCount: 20,
      acceptedCount: 20,
    });
    expect(result.openPlaces).toBeUndefined();
    expect(result.directAcceptancePlaces).toBeUndefined();
  });

  it('counts against targetDrawSize, and a withdrawal frees a place while an alternate takes none', () => {
    const { eventId, entered, spareIds } = seedEvent();
    setEntryProfile(eventId, { targetDrawSize: 32 });
    let result: any = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ basis: 'TARGET_DRAW_SIZE', drawPositions: 32, directAcceptancePlaces: 32 });
    expect(result.openPlaces).toEqual(12);

    result = tournamentEngine.addEventEntries({ eventId, participantIds: spareIds, entryStatus: ALTERNATE });
    expect(result.success).toEqual(true);
    result = tournamentEngine.modifyEntriesStatus({ eventId, participantIds: [entered[0]], entryStatus: WITHDRAWN });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ directAcceptedCount: 19, openPlaces: 13 });
  });

  it('holds places for qualifiers (qualifiersCount) and wildcards (wildcardCount)', () => {
    const { eventId, spareIds } = seedEvent();
    setEntryProfile(eventId, { targetDrawSize: 32, qualifyingDrawSize: 16, qualifiersCount: 4, wildcardCount: 3 });
    let result: any = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({
      qualifierPositionsBasis: 'ENTRY_PROFILE',
      qualifierPositions: 4,
      wildcardPositions: 3,
      wildcardsAccepted: 0,
      directAcceptancePlaces: 25,
      openPlaces: 5,
    });

    // a wildcard fills a held place, not a direct one; wildcards beyond those held take direct places
    result = tournamentEngine.addEventEntries({ eventId, participantIds: spareIds.slice(0, 1), entryStatus: WILDCARD });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ wildcardsAccepted: 1, wildcardPositions: 3, acceptedCount: 21, openPlaces: 5 });

    result = tournamentEngine.addEventEntries({ eventId, participantIds: spareIds.slice(1), entryStatus: WILDCARD });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({
      wildcardsAccepted: 4,
      wildcardPositions: 4,
      directAcceptancePlaces: 24,
      openPlaces: 4,
    });
  });

  it('a qualifying draw size alone holds no MAIN place: it does not say how many qualify', () => {
    const { eventId } = seedEvent();
    setEntryProfile(eventId, { targetDrawSize: 32, qualifyingDrawSize: 16 });
    const result: any = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ qualifierPositions: 0, qualifierPositionsBasis: 'NONE', openPlaces: 12 });
  });

  it('qualifyingProfiles: only each path’s final stage fills MAIN places, whatever round it enters', () => {
    const { eventId } = seedEvent();
    setEntryProfile(eventId, {
      targetDrawSize: 32,
      qualifyingProfiles: [
        {
          // pre-qualifying sends 8 to qualifying, which sends 4 to MAIN
          structureProfiles: [
            { stageSequence: 1, drawSize: 32, qualifyingPositions: 8 },
            { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
          ],
        },
        // a second qualifying structure feeding MAIN's second round
        { roundTarget: 2, structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] },
      ],
    });
    const result: any = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ qualifierPositions: 6, directAcceptancePlaces: 26, openPlaces: 6 });
  });

  it('falls back to the sanctioning constraints extension, after targetDrawSize', () => {
    const { eventId } = seedEvent();
    let result: any = tournamentEngine.addTournamentExtension({
      extension: { name: SANCTIONING_CONSTRAINTS, value: { events: [{ eventType: SINGLES_EVENT, drawSize: 24 }] } },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ basis: 'SANCTIONING_CONSTRAINTS', drawPositions: 24, openPlaces: 4 });

    setEntryProfile(eventId, { targetDrawSize: 32 });
    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ basis: 'TARGET_DRAW_SIZE', drawPositions: 32, openPlaces: 12 });
  });

  it('refuses without an event', () => {
    seedEvent();
    const result: any = tournamentEngine.getEventEntrySpace({ eventId: 'none' });
    expect(result.error).toBeDefined();
  });
});

describe('getEventEntrySpace after a draw is generated', () => {
  it('the structure decides: its positions, and the qualifier positions its links deliver', () => {
    const { eventId } = seedEvent();
    // the profile says one thing; the generated draw, which is what will be played, says another
    setEntryProfile(eventId, { targetDrawSize: 64, qualifiersCount: 8 });

    let result: any = tournamentEngine.generateDrawDefinition({
      qualifyingPlaceholder: true,
      qualifiersCount: 4,
      drawSize: 32,
      eventId,
    });
    expect(result.success).toEqual(true);
    const { drawDefinition } = result;
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.success).toEqual(true);
    const { drawId } = drawDefinition;

    const expected = {
      basis: 'STRUCTURE',
      drawPositions: 32,
      qualifierPositions: 4,
      qualifierPositionsBasis: 'STRUCTURE',
      directAcceptedCount: 20,
      directAcceptancePlaces: 28,
      openPlaces: 8,
    };
    expect(tournamentEngine.getEventEntrySpace({ eventId })).toMatchObject(expected);
    expect(tournamentEngine.getEventEntrySpace({ eventId, drawId })).toMatchObject(expected);
  });

  it('a draw with no qualifying holds no qualifier positions, whatever the profile says', () => {
    const { eventId } = seedEvent();
    setEntryProfile(eventId, { targetDrawSize: 32, qualifiersCount: 4 });
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);

    result = tournamentEngine.getEventEntrySpace({ eventId });
    expect(result).toMatchObject({ basis: 'STRUCTURE', qualifierPositions: 0, qualifierPositionsBasis: 'NONE' });
    expect(result.openPlaces).toEqual(12);
  });
});
