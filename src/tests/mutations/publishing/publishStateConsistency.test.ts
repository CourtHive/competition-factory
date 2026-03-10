import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { AD_HOC, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const AFTER_EMBARGO = '2025-06-21T00:00:00Z';
const START_DATE = '2025-06-15';

describe('publish state consistency between competitionScheduleMatchUps and getEventData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('published draw: both methods return data for that draw', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    // Schedule matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish
    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData.length).toEqual(1);
    expect(eventData.drawsData[0].drawId).toEqual(drawId);

    // competitionScheduleMatchUps
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
    result.dateMatchUps.forEach((m) => expect(m.drawId).toEqual(drawId));
  });

  it('unpublished draw: both methods exclude that draw when usePublishState is true', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    // Schedule matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish OOP but NOT the event
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData with usePublishState: event not published → drawsData empty or undefined
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData?.length ?? 0).toEqual(0);

    // competitionScheduleMatchUps with usePublishState: no published events → no published drawIds
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    // With usePublishState and OOP published, published drawIds is empty → no matchUps
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('embargoed draw: both methods hide that draw', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    // Schedule matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish with embargo
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData: draw should be hidden (embargoed)
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData?.length ?? 0).toEqual(0);

    // competitionScheduleMatchUps: matchUps from embargoed draw should be hidden
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('embargoed round: both methods strip schedule from that round matchUps', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          eventType: SINGLES_EVENT,
          drawType: AD_HOC,
          automated: true,
          roundsCount: 3,
          drawSize: 20,
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    // Embargo round 2 schedule
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: { 2: { published: true, embargo: FUTURE_EMBARGO } },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData path
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const edRound2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    const edRound1 = eventData.drawsData[0].structures[0].roundMatchUps[1] || [];

    // competitionScheduleMatchUps path
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const csmRound2 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 2);
    const csmRound1 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 1);

    // Both: round 2 schedule stripped
    edRound2.forEach((m) => expect(m.schedule).toBeUndefined());
    csmRound2.forEach((m) => expect(m.schedule).toBeUndefined());

    // Both: round 1 schedule intact
    edRound1.forEach((m) => expect(m.schedule).toBeDefined());
    csmRound1.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('usePublishState: false — both methods ignore publish state entirely', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish with embargo (would hide with usePublishState: true)
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      eventId,
    });

    // getEventData without usePublishState
    const { eventData } = tournamentEngine.getEventData({ eventId });
    expect(eventData.drawsData.length).toEqual(1);

    // competitionScheduleMatchUps without usePublishState
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
    });
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
  });

  it('no publish state set at all — both methods return everything (backward compat)', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // No publishEvent, no publishOrderOfPlay — backward compat
    // getEventData
    const { eventData } = tournamentEngine.getEventData({ eventId });
    expect(eventData.drawsData.length).toEqual(1);

    // competitionScheduleMatchUps
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
    });
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
  });

  it('published then unpublished — both methods reflect the unpublished state', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish
    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Verify published state works
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toBeGreaterThan(0);

    // Unpublish the event
    tournamentEngine.unPublishEvent({ eventId });

    // getEventData: draw should no longer be in published state
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData?.length ?? 0).toEqual(0);

    // competitionScheduleMatchUps: with usePublishState, unpublished draws excluded
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('roundLimit on AD_HOC: getEventData limits visible rounds; schedule limits matchUps', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          eventType: SINGLES_EVENT,
          drawType: AD_HOC,
          automated: true,
          roundsCount: 3,
          drawSize: 20,
        },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    // Publish with roundLimit: 2
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: { [structureId]: { roundLimit: 2, published: true } },
        },
      },
      returnEventData: true,
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData: should only show rounds 1 and 2
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const roundKeys = Object.keys(eventData.drawsData[0].structures[0].roundMatchUps);
    expect(roundKeys).toEqual(['1', '2']);

    // competitionScheduleMatchUps: should only show rounds 1 and 2
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort((a: any, b: any) => a - b);
    expect(roundNumbers).toEqual([1, 2]);
  });

  it('stage embargo: getEventData excludes stage structures; schedule excludes stage matchUps', () => {
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

    // Schedule all matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Publish with QUALIFYING stage embargoed
    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: true, embargo: FUTURE_EMBARGO },
            [MAIN]: { published: true },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // getEventData: qualifying structures should be hidden
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const stages = eventData.drawsData[0].structures.map((s) => s.stage);
    expect(stages).toContain(MAIN);
    expect(stages).not.toContain(QUALIFYING);

    // competitionScheduleMatchUps: qualifying matchUps should be hidden
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const qualMatchUps = result.dateMatchUps.filter((m) => m.stage === QUALIFYING);
    expect(qualMatchUps.length).toEqual(0);

    // MAIN matchUps should still be present
    const mainMatchUps = result.dateMatchUps.filter((m) => m.stage === MAIN);
    expect(mainMatchUps.length).toBeGreaterThan(0);
  });

  it('embargo expiry: both methods transition from hidden to visible consistently', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // Before embargo expiry: both hide
    let eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
    expect(eventData.drawsData?.length ?? 0).toEqual(0);

    let csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toEqual(0);

    // Advance past embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // After embargo expiry: both show
    eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
    expect(eventData.drawsData.length).toEqual(1);

    csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toBeGreaterThan(0);
  });
});
