import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

/**
 * Two publishing defects surfaced while giving TMX per-structure publishing (TMX #1574).
 *
 * 1. `publishEvent` published the draw on EVERY drawDetails write: `if (structureIdsToAdd || stagesToAdd)`
 *    is always true because both default to `[]`, so an explicit `publishingDetail: { published: false }`
 *    was overridden. And a write that omitted `publishingDetail` reset it to `{}`, lifting the draw embargo.
 *
 * 2. A structure with no detail in a KEYED `structureDetails` was judged three ways: visible in
 *    `getDrawData`, hidden in `getEventData`, and visible in `competitionScheduleMatchUps` only when every
 *    keyed structure was unpublished. Every reader now shares `isStructureVisible`: a keyed level is an
 *    inclusion list.
 */

const startDate = '2026-10-10';
const DAY_MS = 86_400_000;

function setup() {
  const {
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
      },
    ],
    setState: true,
    startDate,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureIdOf = (stage: string) => drawDefinition.structures.find((s: any) => s.stage === stage).structureId;
  return { eventId, drawId, qualifyingId: structureIdOf(QUALIFYING), mainId: structureIdOf(MAIN) };
}

const publicStages = (eventId: string) =>
  (tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData?.drawsData ?? []).flatMap((draw: any) =>
    (draw.structures ?? []).map((s: any) => s.stage),
  );

const drawDetailOf = (eventId: string, drawId: string) =>
  tournamentEngine.getPublishState({ eventId }).publishState.status.drawDetails[drawId];

describe('publishEvent drawDetails write', () => {
  it('honours an explicit published: false for the draw', () => {
    const { eventId, drawId } = setup();
    let result: any = tournamentEngine.publishEvent({ eventId });
    expect(result.success).toEqual(true);
    // control: the draw is public before the write
    expect(publicStages(eventId).length).toBeGreaterThan(0);

    result = tournamentEngine.publishEvent({
      drawDetails: { [drawId]: { publishingDetail: { published: false } } },
      eventId,
    });
    expect(result.success).toEqual(true);

    expect(drawDetailOf(eventId, drawId).publishingDetail.published).toEqual(false);
    expect(publicStages(eventId)).toEqual([]);
  });

  it('keeps the draw embargo when a write touches only structures', () => {
    const { eventId, drawId, qualifyingId, mainId } = setup();
    const embargo = new Date(Date.now() + DAY_MS).toISOString();
    let result: any = tournamentEngine.publishEvent({
      drawDetails: { [drawId]: { publishingDetail: { published: true, embargo } } },
      eventId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: { structureDetails: { [qualifyingId]: { published: true }, [mainId]: { published: false } } },
      },
      eventId,
    });
    expect(result.success).toEqual(true);

    const { publishingDetail, structureDetails } = drawDetailOf(eventId, drawId);
    expect(publishingDetail).toEqual({ published: true, embargo });
    expect(structureDetails[mainId].published).toEqual(false);
  });

  it('still publishes a keyed draw when publishingDetail says nothing about it', () => {
    const { eventId, drawId, qualifyingId, mainId } = setup();
    const result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: { structureDetails: { [qualifyingId]: { published: true }, [mainId]: { published: false } } },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(drawDetailOf(eventId, drawId).publishingDetail.published).toEqual(true);
    expect(publicStages(eventId)).toEqual([QUALIFYING]);
  });
});

describe('a structure missing from a keyed structureDetails', () => {
  it('is hidden by getEventData, getDrawData and the order of play alike', () => {
    const { eventId, drawId, qualifyingId, mainId } = setup();

    const mainMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { structureIds: [mainId] },
      inContext: false,
    }).matchUps;
    // control: MAIN has matchUps, so "none in the order of play" is a filter result and not an empty draw
    expect(mainMatchUps.length).toBeGreaterThan(0);

    let result: any = tournamentEngine.bulkScheduleMatchUps({
      matchUpIds: mainMatchUps.map(({ matchUpId }) => matchUpId),
      schedule: { scheduledDate: startDate },
    });
    expect(result.success).toEqual(true);

    // Keyed with qualifying ONLY, unpublished: MAIN has no entry. The order of play used to read this as
    // an exclusion list (every keyed entry unpublished, so everything else shows).
    result = tournamentEngine.publishEvent({
      drawDetails: { [drawId]: { structureDetails: { [qualifyingId]: { published: false } } } },
      eventId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.publishOrderOfPlay();
    expect(result.success).toEqual(true);

    // control: unfiltered, the scheduled MAIN matchUps are on the date
    const unfiltered = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    }).dateMatchUps;
    expect(unfiltered.length).toEqual(mainMatchUps.length);

    const published = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    }).dateMatchUps;
    expect(published.length).toEqual(0);

    expect(publicStages(eventId)).toEqual([]);

    const drawData = tournamentEngine.getDrawData({ drawId, usePublishState: true });
    expect((drawData.structures ?? []).map((s: any) => s.structureId)).toEqual([]);
  });

  it('shows every structure when structureDetails is not keyed — the legacy shape', () => {
    const { eventId, drawId } = setup();
    const result: any = tournamentEngine.publishEvent({ eventId });
    expect(result.success).toEqual(true);
    expect(publicStages(eventId).toSorted((a: string, b: string) => a.localeCompare(b))).toEqual([MAIN, QUALIFYING]);
    expect(tournamentEngine.getDrawData({ drawId, usePublishState: true }).structures.length).toEqual(2);
  });
});
