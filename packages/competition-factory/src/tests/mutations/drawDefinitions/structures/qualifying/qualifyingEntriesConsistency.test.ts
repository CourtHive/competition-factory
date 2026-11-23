import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import {
  ENTRIES_NOT_PLACED,
  INSUFFICIENT_DRAW_POSITIONS,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';

/*
 * The rule for draw entries (CA 2026-11-01): explicit drawEntries that overfill a structure are refused before any
 * write; entries taken from the event (no drawEntries) are trimmed to the first N with an ENTRIES_NOT_PLACED warning;
 * never silent. Two paths did not follow it:
 * - adding qualifying to an existing draw with no drawEntries attached no qualifying entries at all;
 * - a new draw with a main and qualifying trimmed overfull QUALIFYING drawEntries when ignoreStageSpace was false.
 */

const qualifyingProfiles = [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }];

function seedEvent({ qualifyingCount }: { qualifyingCount: number }) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 48 },
    eventProfiles: [{ eventName: 'Singles' }],
    setState: true,
  });

  const participantIds = tournamentEngine.getParticipants().participants.map((p) => p.participantId);
  let result: any = tournamentEngine.addEventEntries({ participantIds: participantIds.slice(0, 12), eventId });
  expect(result.success).toEqual(true);
  const qualifyingIds = participantIds.slice(12, 12 + qualifyingCount);
  result = tournamentEngine.addEventEntries({ participantIds: qualifyingIds, entryStage: QUALIFYING, eventId });
  expect(result.success).toEqual(true);

  const entries = tournamentEngine.getEvent({ eventId }).event.entries;
  const mainEntries = entries.filter(({ entryStage }) => entryStage !== QUALIFYING);
  const qualifyingEntries = entries.filter(({ entryStage }) => entryStage === QUALIFYING);

  return { eventId, mainEntries, qualifyingEntries, qualifyingIds };
}

// a 16 main for 4 qualifiers, generated from explicit drawEntries and added to the event
function seedDraw({ qualifyingCount, carried = 0, placeholder = true }) {
  const seeded = seedEvent({ qualifyingCount });
  let result: any = tournamentEngine.generateDrawDefinition({
    drawEntries: [...seeded.mainEntries, ...seeded.qualifyingEntries.slice(0, carried)],
    qualifyingPlaceholder: placeholder,
    eventId: seeded.eventId,
    ignoreStageSpace: true,
    qualifiersCount: 4,
    drawSize: 16,
  });
  expect(result.success).toEqual(true);
  const drawId = result.drawDefinition.drawId;
  result = tournamentEngine.addDrawDefinition({ eventId: seeded.eventId, drawDefinition: result.drawDefinition });
  expect(result.success).toEqual(true);
  return { ...seeded, drawId };
}

const storedDraw = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;

const stageEntryIds = (drawDefinition: any, stage: string) =>
  drawDefinition.entries.filter((e) => e.entryStage === stage).map((e) => e.participantId);

const placedIds = (drawDefinition: any, stage: string) =>
  drawDefinition.structures
    .filter((s) => s.stage === stage)
    .flatMap((s) => s.positionAssignments ?? [])
    .map(({ participantId }) => participantId)
    .filter(Boolean);

const notPlacedWarnings = (result: any) =>
  (result.warnings ?? []).filter(({ code }) => code === ENTRIES_NOT_PLACED.code);

describe('adding qualifying to an existing draw with no drawEntries takes the event QUALIFYING entries', () => {
  it('into a placeholder: the first 8 of 12, the other 4 warned, the stored draw untouched until committed', () => {
    const { eventId, drawId, qualifyingIds } = seedDraw({ qualifyingCount: 12 });
    const before = storedDraw(drawId);
    expect(stageEntryIds(before, QUALIFYING)).toEqual([]);

    const result: any = tournamentEngine.generateDrawDefinition({ qualifyingProfiles, drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.existingDrawDefinition).toEqual(true);
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 8));
    expect(placedIds(result.drawDefinition, QUALIFYING).sort()).toEqual(qualifyingIds.slice(0, 8).sort());

    const warnings = notPlacedWarnings(result);
    expect(warnings.length).toEqual(1);
    expect(warnings[0]).toMatchObject({
      participantIds: qualifyingIds.slice(8),
      stage: QUALIFYING,
      drawSize: 8,
      count: 4,
      drawId,
    });

    expect(storedDraw(drawId)).toEqual(before);
  });

  it('into a placeholder: an exact fit takes all 8, with no warning', () => {
    const { eventId, drawId, qualifyingIds } = seedDraw({ qualifyingCount: 8 });

    const result: any = tournamentEngine.generateDrawDefinition({ qualifyingProfiles, drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds);
    expect(placedIds(result.drawDefinition, QUALIFYING).length).toEqual(8);
  });

  it('into a main with no placeholder: the first 8 of 12, the other 4 warned', () => {
    const { eventId, drawId, qualifyingIds } = seedDraw({ qualifyingCount: 12, placeholder: false });

    const result: any = tournamentEngine.generateDrawDefinition({ qualifyingProfiles, drawId, eventId });
    expect(result.success).toEqual(true);
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 8));
    expect(notPlacedWarnings(result)[0]).toMatchObject({ participantIds: qualifyingIds.slice(8), count: 4 });
  });

  it('a draw already holding QUALIFYING entries keeps them and takes none from the event', () => {
    const { eventId, drawId, qualifyingIds } = seedDraw({ qualifyingCount: 12, carried: 6 });
    expect(stageEntryIds(storedDraw(drawId), QUALIFYING)).toEqual(qualifyingIds.slice(0, 6));

    const result: any = tournamentEngine.generateDrawDefinition({ qualifyingProfiles, drawId, eventId });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 6));
  });

  it('explicit drawEntries are still the only qualifying entries taken', () => {
    const { eventId, drawId, qualifyingEntries, qualifyingIds } = seedDraw({ qualifyingCount: 12 });

    const result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries.slice(2, 7),
      qualifyingProfiles,
      drawId,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(2, 7));
  });
});

describe('a new draw with a main and qualifying refuses overfull QUALIFYING drawEntries', () => {
  it('with ignoreStageSpace false: refused, as #6095 refuses them, not trimmed', () => {
    const { eventId, mainEntries, qualifyingEntries } = seedEvent({ qualifyingCount: 12 });

    const result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: [...mainEntries, ...qualifyingEntries],
      ignoreStageSpace: false,
      qualifyingProfiles,
      drawSize: 16,
      eventId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toMatchObject({ stage: QUALIFYING, entriesCount: 12, drawPositionsCount: 8 });
    expect(result.drawDefinition).toBeUndefined();
    expect(result.warnings).toBeUndefined();
    expect(tournamentEngine.getEvent({ eventId }).event.drawDefinitions ?? []).toEqual([]);
  });

  it('with ignoreStageSpace unset or true: INSUFFICIENT_DRAW_POSITIONS, as before', () => {
    for (const ignoreStageSpace of [undefined, true]) {
      const { eventId, mainEntries, qualifyingEntries } = seedEvent({ qualifyingCount: 12 });
      const result: any = tournamentEngine.generateDrawDefinition({
        drawEntries: [...mainEntries, ...qualifyingEntries],
        qualifyingProfiles,
        ignoreStageSpace,
        drawSize: 16,
        eventId,
      });
      expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
      expect(result.context).toMatchObject({ stage: QUALIFYING, entriesCount: 12, drawPositionsCount: 8 });
    }
  });

  it('an exact fit succeeds with no warning, whatever ignoreStageSpace', () => {
    for (const ignoreStageSpace of [undefined, false, true]) {
      const { eventId, mainEntries, qualifyingEntries, qualifyingIds } = seedEvent({ qualifyingCount: 8 });
      const result: any = tournamentEngine.generateDrawDefinition({
        drawEntries: [...mainEntries, ...qualifyingEntries],
        qualifyingProfiles,
        ignoreStageSpace,
        drawSize: 16,
        eventId,
      });
      expect(result.success).toEqual(true);
      expect(result.warnings).toBeUndefined();
      expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds);
      expect(placedIds(result.drawDefinition, QUALIFYING).length).toEqual(8);
    }
  });

  it('from the event entries with ignoreStageSpace false: still the first 8, the rest warned', () => {
    const { eventId, mainEntries, qualifyingIds } = seedEvent({ qualifyingCount: 12 });

    const result: any = tournamentEngine.generateDrawDefinition({
      ignoreStageSpace: false,
      qualifyingProfiles,
      drawSize: 16,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(stageEntryIds(result.drawDefinition, MAIN)).toEqual(mainEntries.map(({ participantId }) => participantId));
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 8));
    expect(notPlacedWarnings(result)[0]).toMatchObject({ participantIds: qualifyingIds.slice(8), count: 4 });
  });

  it('QUALIFYING drawEntries riding along with a main-only draw are all kept, whatever ignoreStageSpace', () => {
    for (const ignoreStageSpace of [undefined, false, true]) {
      const { eventId, mainEntries, qualifyingEntries, qualifyingIds } = seedEvent({ qualifyingCount: 12 });
      const result: any = tournamentEngine.generateDrawDefinition({
        drawEntries: [...mainEntries, ...qualifyingEntries],
        ignoreStageSpace,
        drawSize: 16,
        eventId,
      });
      expect(result.success).toEqual(true);
      expect(result.warnings).toBeUndefined();
      expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds);
    }
  });
});
