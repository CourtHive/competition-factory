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
 * Adding qualifying to an existing draw with explicit drawEntries: the director chose those entries, so entries that
 * overfill the qualifying structure are refused before anything is written, never trimmed (CA 2026-11-01). The error
 * is the one a new qualifying-only draw returns: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS, or
 * INSUFFICIENT_DRAW_POSITIONS with ignoreStageSpace. Generation from the event's entries still takes the first N and
 * warns (ENTRIES_NOT_PLACED).
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

// a 16 main with a qualifying placeholder for 4 qualifiers, added to the event: TMX's shape before "add qualifying"
function seedDrawWithPlaceholder({ qualifyingCount }: { qualifyingCount: number }) {
  const seeded = seedEvent({ qualifyingCount });
  let result: any = tournamentEngine.generateDrawDefinition({
    drawEntries: seeded.mainEntries,
    eventId: seeded.eventId,
    qualifyingPlaceholder: true,
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

describe('adding qualifying to an existing draw refuses overfull drawEntries', () => {
  it('12 drawEntries into an 8 qualifying structure, with ignoreStageSpace: refused, the draw unchanged', () => {
    const { eventId, drawId, qualifyingEntries } = seedDrawWithPlaceholder({ qualifyingCount: 12 });
    const before = storedDraw(drawId);

    const result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries,
      ignoreStageSpace: true,
      qualifyingProfiles,
      drawId,
      eventId,
    });
    expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
    expect(result.context).toMatchObject({ stage: QUALIFYING, entriesCount: 12, drawPositionsCount: 8 });
    expect(result.drawDefinition).toBeUndefined();

    expect(storedDraw(drawId)).toEqual(before);
  });

  it('12 drawEntries into an 8 qualifying structure, without ignoreStageSpace: refused, the draw unchanged', () => {
    const { eventId, drawId, qualifyingEntries } = seedDrawWithPlaceholder({ qualifyingCount: 12 });
    const before = storedDraw(drawId);

    const result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries,
      qualifyingProfiles,
      drawId,
      eventId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toMatchObject({ stage: QUALIFYING, entriesCount: 12, drawPositionsCount: 8 });

    expect(storedDraw(drawId)).toEqual(before);
  });

  it('8 drawEntries into an 8 qualifying structure succeed, with no warning', () => {
    const { eventId, drawId, qualifyingEntries, qualifyingIds } = seedDrawWithPlaceholder({ qualifyingCount: 8 });

    for (const ignoreStageSpace of [true, undefined]) {
      const result: any = tournamentEngine.generateDrawDefinition({
        drawEntries: qualifyingEntries,
        qualifyingProfiles,
        ignoreStageSpace,
        drawId,
        eventId,
      });
      expect(result.success).toEqual(true);
      expect(result.existingDrawDefinition).toEqual(true);
      expect(result.warnings).toBeUndefined();
      expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds);
      const qualifyingStructure = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
      expect(qualifyingStructure.positionAssignments.length).toEqual(8);
    }
  });

  it('qualifying generated from the event entries takes the first 8 and still warns', () => {
    const { eventId, mainEntries, qualifyingIds } = seedEvent({ qualifyingCount: 12 });

    const result: any = tournamentEngine.generateDrawDefinition({ qualifyingProfiles, drawSize: 16, eventId });
    expect(result.success).toEqual(true);
    expect(stageEntryIds(result.drawDefinition, MAIN)).toEqual(mainEntries.map(({ participantId }) => participantId));
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 8));

    const warnings = (result.warnings ?? []).filter(({ code }) => code === ENTRIES_NOT_PLACED.code);
    expect(warnings.length).toEqual(1);
    expect(warnings[0]).toMatchObject({ participantIds: qualifyingIds.slice(8), stage: QUALIFYING, count: 4 });
  });

  it('a new qualifying-only draw refuses overfull drawEntries as before, and takes an exact fit', () => {
    const { eventId, qualifyingEntries } = seedEvent({ qualifyingCount: 12 });

    let result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries,
      qualifyingOnly: true,
      qualifyingProfiles,
      eventId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

    result = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries,
      ignoreStageSpace: true,
      qualifyingOnly: true,
      qualifyingProfiles,
      eventId,
    });
    expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);

    result = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingEntries.slice(0, 8),
      ignoreStageSpace: true,
      qualifyingOnly: true,
      qualifyingProfiles,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });
});
