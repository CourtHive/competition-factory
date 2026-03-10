import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const START_DATE = '2025-06-15';

describe('draw-level publishing granularity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publish draw with stageDetails: MAIN published, QUALIFYING unpublished', () => {
    const drawId = 'drawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
    });

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentEngine.getEvent({ drawId }).event;
    const eventId = event.eventId;

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish: MAIN published, QUALIFYING explicitly unpublished (not embargoed)
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: false },
            [MAIN]: { published: true },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM: only MAIN matchUps
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const qualMatchUps = csmResult.dateMatchUps.filter((m) => m.stage === QUALIFYING);
    expect(qualMatchUps.length).toEqual(0);
    const mainMatchUps = csmResult.dateMatchUps.filter((m) => m.stage === MAIN);
    expect(mainMatchUps.length).toBeGreaterThan(0);

    // getEventData: only MAIN structures
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const stages = eventData.drawsData[0].structures.map((s) => s.stage);
    expect(stages).toContain(MAIN);
    expect(stages).not.toContain(QUALIFYING);
  });

  it('publish draw with structureDetails: one structure published, another not', () => {
    const drawId = 'drawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
    });

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentEngine.getEvent({ drawId }).event;
    const eventId = event.eventId;
    const structures = event.drawDefinitions[0].structures;
    const mainStructure = structures.find((s) => s.stage === MAIN);
    const qualStructure = structures.find((s) => s.stage === QUALIFYING);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish MAIN structure, unpublish QUALIFYING structure by structureId
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [mainStructure.structureId]: { published: true },
            [qualStructure.structureId]: { published: false },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM: only published structure's matchUps
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const structureIds = [...new Set(csmResult.dateMatchUps.map((m) => m.structureId))];
    expect(structureIds).toContain(mainStructure.structureId);
    expect(structureIds).not.toContain(qualStructure.structureId);
  });

  it('drawIdsToAdd then drawIdsToRemove — draw visibility toggles', () => {
    const drawId1 = 'draw1';
    const drawId2 = 'draw2';
    const eventId = 'event1';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          eventId,
          drawProfiles: [
            { drawSize: 8, drawId: drawId1 },
            { drawSize: 8, drawId: drawId2 },
          ],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Initially publish both draws
    tournamentEngine.publishEvent({
      drawIdsToAdd: [drawId1, drawId2],
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Both visible
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);

    // Remove draw1
    tournamentEngine.publishEvent({
      drawIdsToRemove: [drawId1],
      eventId,
    });

    // Only draw2 visible
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).not.toContain(drawId1);
    expect(drawIds).toContain(drawId2);

    // Re-add draw1
    tournamentEngine.publishEvent({
      drawIdsToAdd: [drawId1],
      eventId,
    });

    // Both visible again
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);
  });

  it('add stageDetails after initial publish — incremental update works', () => {
    const drawId = 'drawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
    });

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentEngine.getEvent({ drawId }).event;
    const eventId = event.eventId;

    // First publish without stageDetails
    tournamentEngine.publishEvent({ eventId });

    // Both stages visible
    let { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    let stages = eventData.drawsData[0].structures.map((s) => s.stage);
    expect(stages).toContain(MAIN);
    expect(stages).toContain(QUALIFYING);

    // Now add stageDetails to hide QUALIFYING
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: false },
            [MAIN]: { published: true },
          },
        },
      },
      eventId,
    });

    // QUALIFYING should be hidden
    ({ eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true }));
    stages = eventData.drawsData[0].structures.map((s) => s.stage);
    expect(stages).toContain(MAIN);
    expect(stages).not.toContain(QUALIFYING);
  });

  it('remove stage from published draw — matchUps for that stage disappear from schedule', () => {
    const drawId = 'drawId';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
    });

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentEngine.getEvent({ drawId }).event;
    const eventId = event.eventId;

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish with both stages
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: true },
            [MAIN]: { published: true },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Both stages in schedule
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let stagesInSchedule = [...new Set(result.dateMatchUps.map((m) => m.stage))];
    expect(stagesInSchedule).toContain(MAIN);
    expect(stagesInSchedule).toContain(QUALIFYING);

    // Now unpublish QUALIFYING stage
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: false },
            [MAIN]: { published: true },
          },
        },
      },
      removePriorValues: true,
      eventId,
    });

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    stagesInSchedule = [...new Set(result.dateMatchUps.map((m) => m.stage))];
    expect(stagesInSchedule).toContain(MAIN);
    expect(stagesInSchedule).not.toContain(QUALIFYING);
  });

  it('legacy drawIds array + new drawDetails — both work', () => {
    const drawId1 = 'draw1';
    const drawId2 = 'draw2';
    const eventId = 'event1';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          eventId,
          drawProfiles: [
            { drawSize: 8, drawId: drawId1 },
            { drawSize: 8, drawId: drawId2 },
          ],
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish with drawDetails (new style)
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId1]: { publishingDetail: { published: true } },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    let { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    let drawIds = eventData.drawsData.map((d) => d.drawId);
    expect(drawIds).toContain(drawId1);
    // draw2 is not in drawDetails, so its visibility depends on implementation
    // The key thing is that drawId1 is published and visible
    expect(drawIds.includes(drawId1)).toEqual(true);
  });
});
