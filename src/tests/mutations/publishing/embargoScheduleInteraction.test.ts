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
const PAST_EMBARGO = '2025-06-10T12:00:00Z';
const START_DATE = '2025-06-15';

describe('embargo + schedule deep interaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draw-level embargo (future): both CSM and getEventData hide matchUps', () => {
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
      drawDetails: { [drawId]: { publishingDetail: { published: true, embargo: FUTURE_EMBARGO } } },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toEqual(0);

    // getEventData
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData?.length ?? 0).toEqual(0);
  });

  it('draw-level embargo (expired): both show matchUps', () => {
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
      drawDetails: { [drawId]: { publishingDetail: { published: true, embargo: PAST_EMBARGO } } },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toBeGreaterThan(0);

    // getEventData
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData.length).toEqual(1);
  });

  it('stage embargo: schedule excludes stage matchUps; getEventData excludes stage structures', () => {
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

    // CSM: no qualifying matchUps
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const qualMatchUps = csmResult.dateMatchUps.filter((m) => m.stage === QUALIFYING);
    expect(qualMatchUps.length).toEqual(0);
    const mainMatchUps = csmResult.dateMatchUps.filter((m) => m.stage === MAIN);
    expect(mainMatchUps.length).toBeGreaterThan(0);

    // getEventData: no qualifying structures
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const stages = eventData.drawsData[0].structures.map((s) => s.stage);
    expect(stages).toContain(MAIN);
    expect(stages).not.toContain(QUALIFYING);
  });

  it('structure embargo: schedule excludes structure matchUps; getEventData excludes structure', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: { [structureId]: { published: true, embargo: FUTURE_EMBARGO } },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM: matchUps from the embargoed structure should be hidden
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const structureMatchUps = csmResult.dateMatchUps.filter((m) => m.structureId === structureId);
    expect(structureMatchUps.length).toEqual(0);

    // getEventData: structure should be filtered out
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const structureIds = eventData.drawsData?.[0]?.structures?.map((s) => s.structureId) ?? [];
    expect(structureIds).not.toContain(structureId);
  });

  it('OOP embargo (future): CSM returns empty; getEventData unaffected', () => {
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

    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], embargo: FUTURE_EMBARGO });

    // CSM: OOP embargoed → empty dateMatchUps
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toEqual(0);

    // getEventData: not affected by OOP embargo (OOP is schedule-specific)
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    expect(eventData.drawsData.length).toEqual(1);
  });

  it('OOP embargo (expired): schedule returns normally', () => {
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

    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], embargo: PAST_EMBARGO });

    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    expect(csmResult.dateMatchUps.length).toBeGreaterThan(0);
  });

  it('round-level embargo: matchUp returned but schedule stripped in BOTH code paths', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          eventType: SINGLES_EVENT,
          drawType: AD_HOC,
          automated: true,
          roundsCount: 2,
          drawSize: 8,
        },
      ],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

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

    // CSM
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const csmRound2 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 2);
    expect(csmRound2.length).toBeGreaterThan(0);
    csmRound2.forEach((m) => expect(m.schedule).toBeUndefined());

    // getEventData
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const edRound2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    expect(edRound2.length).toBeGreaterThan(0);
    edRound2.forEach((m) => expect(m.schedule).toBeUndefined());
  });

  it('round-level embargo expiry: schedule restored in BOTH code paths', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          eventType: SINGLES_EVENT,
          drawType: AD_HOC,
          automated: true,
          roundsCount: 2,
          drawSize: 8,
        },
      ],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

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

    // Advance past embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // CSM: schedule restored
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const csmRound2 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 2);
    csmRound2.forEach((m) => expect(m.schedule).toBeDefined());

    // getEventData: schedule restored
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const edRound2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    edRound2.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('embargo on round + roundLimit: roundLimit caps first, embargo applies within cap', () => {
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

    // roundLimit: 2 caps at round 2; round 2 embargoed
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              roundLimit: 2,
              scheduledRounds: { 2: { published: true, embargo: FUTURE_EMBARGO } },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    // CSM: round 1 has schedule, round 2 has schedule stripped, round 3 capped
    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const roundNumbers = [...new Set(csmResult.dateMatchUps.map((m) => m.roundNumber))].sort((a: any, b: any) => a - b);
    expect(roundNumbers).toEqual([1, 2]); // round 3 capped by roundLimit

    const round2 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 2);
    round2.forEach((m) => expect(m.schedule).toBeUndefined()); // embargoed

    const round1 = csmResult.dateMatchUps.filter((m) => m.roundNumber === 1);
    round1.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('multiple embargoes on different draws: each draw filtered independently', () => {
    const eventId1 = 'event1';
    const eventId2 = 'event2';
    const drawId1 = 'draw1';
    const drawId2 = 'draw2';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { eventId: eventId1, drawProfiles: [{ drawSize: 8, drawId: drawId1 }] },
        { eventId: eventId2, drawProfiles: [{ drawSize: 8, drawId: drawId2 }] },
      ],
      venueProfiles: [{ courtsCount: 10 }],
      startDate: START_DATE,
      setState: true,
    });

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds: getMatchUpIds(allMatchUps) });

    // Draw 1: embargoed (future); Draw 2: not embargoed
    tournamentEngine.publishEvent({
      drawDetails: { [drawId1]: { publishingDetail: { published: true, embargo: FUTURE_EMBARGO } } },
      eventId: eventId1,
    });
    tournamentEngine.publishEvent({
      drawDetails: { [drawId2]: { publishingDetail: { published: true } } },
      eventId: eventId2,
    });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE] });

    const csmResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    // Only draw 2 matchUps should be present
    const drawIds = [...new Set(csmResult.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds).not.toContain(drawId1);
    expect(drawIds).toContain(drawId2);

    // After embargo expires, draw 1 should appear
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    const csmResult2 = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const drawIds2 = [...new Set(csmResult2.dateMatchUps.map((m) => m.drawId))];
    expect(drawIds2).toContain(drawId1);
    expect(drawIds2).toContain(drawId2);
  });

  it('embargo on participants: getPublishState reflects embargo metadata', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    tournamentEngine.publishParticipants({ embargo: FUTURE_EMBARGO });

    const publishState = tournamentEngine.getPublishState().publishState;
    expect(publishState.tournament?.participants?.published).toEqual(true);
    expect(publishState.tournament?.participants?.embargo).toEqual(FUTURE_EMBARGO);

    // After embargo expires
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());
    const publishState2 = tournamentEngine.getPublishState().publishState;
    expect(publishState2.tournament?.participants?.published).toEqual(true);
    // Embargo value still stored but no longer active
    const participantsEmbargo = publishState2.embargoes?.find((e) => e.type === 'participants');
    if (participantsEmbargo) {
      expect(participantsEmbargo.embargoActive).toEqual(false);
    }
  });
});
