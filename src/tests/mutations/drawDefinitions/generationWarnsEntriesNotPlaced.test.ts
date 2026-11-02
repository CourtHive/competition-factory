import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import {
  ENTRIES_NOT_PLACED,
  INSUFFICIENT_DRAW_POSITIONS,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';

/*
 * Generating a draw from an event's entries takes the entries that fit and leaves the surplus on the event. It goes
 * on generating, and says so: the result carries one ENTRIES_NOT_PLACED warning per stage, naming the entries left
 * out, their entryStatus and why. What is generated is unchanged.
 */

type SeedArgs = { mainCount: number; qualifyingCount?: number };

function seedEvent({ mainCount, qualifyingCount = 0 }: SeedArgs) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 48 },
    eventProfiles: [{ eventName: 'Singles' }],
    setState: true,
  });

  const participantIds = tournamentEngine.getParticipants().participants.map((p) => p.participantId);
  const mainIds = participantIds.slice(0, mainCount);
  const qualifyingIds = participantIds.slice(mainCount, mainCount + qualifyingCount);

  let result: any = tournamentEngine.addEventEntries({ participantIds: mainIds, eventId });
  expect(result.success).toEqual(true);
  if (qualifyingIds.length) {
    result = tournamentEngine.addEventEntries({ participantIds: qualifyingIds, entryStage: QUALIFYING, eventId });
    expect(result.success).toEqual(true);
  }

  return { eventId, mainIds, qualifyingIds };
}

const notPlacedWarnings = (result: any) =>
  (result.warnings ?? []).filter(({ code }) => code === ENTRIES_NOT_PLACED.code);

const stageEntryIds = (drawDefinition: any, stage: string) =>
  drawDefinition.entries.filter((e) => e.entryStage === stage).map((e) => e.participantId);

describe('draw generation warns of the entries it leaves out', () => {
  it('a 16 draw from 20 accepted entries names the 4 left out', () => {
    const { eventId, mainIds } = seedEvent({ mainCount: 20 });

    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 16 });
    expect(result.success).toEqual(true);

    const placedIds = stageEntryIds(result.drawDefinition, MAIN);
    expect(placedIds).toEqual(mainIds.slice(0, 16));

    const warnings = notPlacedWarnings(result);
    expect(warnings.length).toEqual(1);
    const leftOutIds = mainIds.slice(16);
    expect(warnings[0]).toEqual({
      ...ENTRIES_NOT_PLACED,
      drawId: result.drawDefinition.drawId,
      participantIds: leftOutIds,
      drawSize: 16,
      stage: MAIN,
      count: 4,
      entries: leftOutIds.map((participantId) => ({
        reason: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS.code,
        entryStatus: DIRECT_ACCEPTANCE,
        participantId,
      })),
    });

    // the warning travels with the generated draw; adding it stores the 16 entries
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);
  });

  it('an exact fit carries no warning', () => {
    const { eventId } = seedEvent({ mainCount: 16 });
    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 16 });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });

  it('drawEntries that overfill the draw are refused, as before, not left out', () => {
    const { eventId } = seedEvent({ mainCount: 20 });
    const drawEntries = tournamentEngine.getEvent({ eventId }).event.entries;
    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 16, drawEntries });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
  });

  it('a qualifying structure generated with the main names the qualifying entries left out', () => {
    const { eventId, mainIds, qualifyingIds } = seedEvent({ mainCount: 12, qualifyingCount: 12 });

    const result: any = tournamentEngine.generateDrawDefinition({
      qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
      drawSize: 16,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(stageEntryIds(result.drawDefinition, MAIN)).toEqual(mainIds);
    expect(stageEntryIds(result.drawDefinition, QUALIFYING)).toEqual(qualifyingIds.slice(0, 8));

    const warnings = notPlacedWarnings(result);
    expect(warnings.length).toEqual(1);
    expect(warnings[0]).toMatchObject({
      participantIds: qualifyingIds.slice(8),
      stage: QUALIFYING,
      drawSize: 8,
      count: 4,
    });
  });

  it('an exact qualifying fit carries no warning', () => {
    const { eventId } = seedEvent({ mainCount: 12, qualifyingCount: 8 });
    const result: any = tournamentEngine.generateDrawDefinition({
      qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
      drawSize: 16,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });

  it('qualifying drawEntries that overfill an existing placeholder are refused, not left out', () => {
    const { eventId } = seedEvent({ mainCount: 12, qualifyingCount: 12 });
    const entries = tournamentEngine.getEvent({ eventId }).event.entries;
    const mainEntries = entries.filter(({ entryStage }) => entryStage !== QUALIFYING);
    const qualifyingEntries = entries.filter(({ entryStage }) => entryStage === QUALIFYING);

    let result: any = tournamentEngine.generateDrawDefinition({
      drawEntries: mainEntries,
      qualifyingPlaceholder: true,
      ignoreStageSpace: true,
      qualifiersCount: 4,
      drawSize: 16,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    const drawId = result.drawDefinition.drawId;
    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);

    // processExistingDrawDefinition: explicit drawEntries are never trimmed (CA 2026-11-01)
    result = tournamentEngine.generateDrawDefinition({
      qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
      drawEntries: qualifyingEntries,
      ignoreStageSpace: true,
      drawId,
      eventId,
    });
    expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  });

  it('a draw from a flight carries its drawEntries: an overfull flight is refused, not left out', () => {
    const { eventId } = seedEvent({ mainCount: 20 });
    let result: any = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 1 });
    expect(result.success).toEqual(true);
    const [flight] = result.flightProfile.flights;

    result = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawId: flight.drawId,
      drawSize: 16,
      eventId,
    });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);

    result = tournamentEngine.generateDrawDefinition({
      drawEntries: flight.drawEntries,
      drawId: flight.drawId,
      drawSize: 32,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
  });
});
