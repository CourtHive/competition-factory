import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLES_EVENT } from '@Constants/eventConstants';

const START_DATE = '2025-07-01';

function setupMultiEventTournament() {
  const eventId1 = 'event1';
  const eventId2 = 'event2';
  const eventId3 = 'event3';
  const drawId1 = 'draw1';
  const drawId2 = 'draw2';
  const drawId3 = 'draw3';

  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { eventId: eventId1, eventType: SINGLES_EVENT, drawProfiles: [{ drawSize: 8, drawId: drawId1 }] },
      { eventId: eventId2, eventType: SINGLES_EVENT, drawProfiles: [{ drawSize: 8, drawId: drawId2 }] },
      { eventId: eventId3, eventType: SINGLES_EVENT, drawProfiles: [{ drawSize: 8, drawId: drawId3 }] },
    ],
    venueProfiles: [{ courtsCount: 10 }],
    startDate: START_DATE,
    setState: true,
  });

  // Schedule all matchUps
  const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
  const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
  tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

  return { eventId1, eventId2, eventId3, drawId1, drawId2, drawId3 };
}

describe('event publish filtering', () => {
  it('3 events, only 2 published — competitionScheduleMatchUps excludes unpublished event matchUps', () => {
    const { eventId1, eventId2, eventId3, drawId1, drawId2 } = setupMultiEventTournament();

    // Publish only events 1 and 2
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishEvent({ eventId: eventId2 });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);
    // Event 3 matchUps should not appear (unpublished draw)
    const event3MatchUps = result.dateMatchUps.filter((m) => m.eventId === eventId3);
    expect(event3MatchUps.length).toEqual(0);
  });

  it('3 events, only 2 in OOP eventIds — third event scheduled matchUps excluded', () => {
    const { eventId1, eventId2, eventId3 } = setupMultiEventTournament();

    // Publish all 3 events
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishEvent({ eventId: eventId2 });
    tournamentEngine.publishEvent({ eventId: eventId3 });

    // But only include events 1 and 2 in OOP
    tournamentEngine.publishOrderOfPlay({
      scheduledDates: [START_DATE],
      eventIds: [eventId1, eventId2],
    });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const eventIds = [...new Set(result.dateMatchUps.map((m) => m.eventId))];
    expect(eventIds).toContain(eventId1);
    expect(eventIds).toContain(eventId2);
    expect(eventIds).not.toContain(eventId3);
  });

  it('publish event A, schedule event B — event B matchUps hidden with usePublishState', () => {
    const { eventId1, eventId2 } = setupMultiEventTournament();

    // Only publish event 1
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const eventIds = [...new Set(result.dateMatchUps.map((m) => m.eventId))];
    expect(eventIds).toContain(eventId1);
    expect(eventIds).not.toContain(eventId2);
  });

  it('unpublish one of two events — only remaining event matchUps visible', () => {
    const { eventId1, eventId2, drawId1, drawId2 } = setupMultiEventTournament();

    // Publish both
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishEvent({ eventId: eventId2 });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Verify both visible
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);

    // Unpublish event 1
    tournamentEngine.unPublishEvent({ eventId: eventId1 });

    // Only event 2 should be visible
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).not.toContain(drawId1);
    expect(drawIds).toContain(drawId2);
  });

  it('matchUpFilters.eventIds intersection with published eventIds — respects both', () => {
    const { eventId1, eventId2, eventId3 } = setupMultiEventTournament();

    // Publish all 3 events
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishEvent({ eventId: eventId2 });
    tournamentEngine.publishEvent({ eventId: eventId3 });

    // OOP includes events 1, 2, and 3
    tournamentEngine.publishOrderOfPlay({
      scheduledDates: [START_DATE],
      eventIds: [eventId1, eventId2, eventId3],
    });

    // But the caller only wants events 1 and 3
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: {
        scheduledDate: START_DATE,
        eventIds: [eventId1, eventId3],
      },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const eventIds = [...new Set(result.dateMatchUps.map((m) => m.eventId))];
    expect(eventIds).toContain(eventId1);
    expect(eventIds).toContain(eventId3);
    expect(eventIds).not.toContain(eventId2);
  });

  it('getEventData for unpublished event with usePublishState — returns empty drawsData', () => {
    const { eventId1 } = setupMultiEventTournament();

    // Do NOT publish event 1
    // getEventData with usePublishState
    const { eventData } = tournamentEngine.getEventData({ eventId: eventId1, usePublishState: true });
    expect(eventData.drawsData?.length ?? 0).toEqual(0);
  });

  it('getEventData for published event — returns full drawsData', () => {
    const { eventId1, drawId1 } = setupMultiEventTournament();

    tournamentEngine.publishEvent({ eventId: eventId1 });

    const { eventData } = tournamentEngine.getEventData({ eventId: eventId1, usePublishState: true });
    expect(eventData.drawsData.length).toEqual(1);
    expect(eventData.drawsData[0].drawId).toEqual(drawId1);
  });

  it('without usePublishState, all events returned regardless of publish state', () => {
    const { eventId1, drawId1, drawId2 } = setupMultiEventTournament();

    // Only publish event 1
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Without usePublishState: should return matchUps from both events
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
    });

    expect(result.success).toEqual(true);
    const drawIds = [...new Set(result.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).toContain(drawId1);
    expect(drawIds).toContain(drawId2);
  });

  it('OOP eventIds empty array vs populated — empty means all published events', () => {
    const { eventId1, eventId2 } = setupMultiEventTournament();

    // Publish both events
    tournamentEngine.publishEvent({ eventId: eventId1 });
    tournamentEngine.publishEvent({ eventId: eventId2 });

    // OOP with no eventIds specified (published for all dates)
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    const eventIds = [...new Set(result.dateMatchUps.map((m) => m.eventId))];
    // Both events should be visible (no eventIds filter on OOP means all)
    expect(eventIds).toContain(eventId1);
    expect(eventIds).toContain(eventId2);
  });
});
