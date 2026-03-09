import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AD_HOC, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const AFTER_EMBARGO = '2025-06-21T00:00:00Z';
const START_DATE = '2025-06-15';

describe('scheduledRounds publishing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('roundLimit on non-AD_HOC does NOT filter bracket', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 8, drawId, drawType: SINGLE_ELIMINATION }] }],
      setState: true,
    });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    const result = tournamentEngine.publishEvent({
      removePriorValues: true,
      returnEventData: true,
      drawDetails: {
        [drawId]: {
          structureDetails: { [structureId]: { roundLimit: 2, published: true } },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);

    // Non-AD_HOC: roundLimit should NOT filter bracket rounds
    const roundKeys = Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps);
    expect(roundKeys.length).toBeGreaterThan(2);
  });

  it('roundLimit on AD_HOC still filters bracket (regression)', () => {
    const {
      tournamentRecord,
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
      participantsProfile: { idPrefix: 'P' },
    });

    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.publishEvent({
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1', '2', '3']);

    const structureId = result.eventData.drawsData[0].structures[0].structureId;

    result = tournamentEngine.publishEvent({
      removePriorValues: true,
      returnEventData: true,
      drawDetails: {
        [drawId]: {
          structureDetails: { [structureId]: { roundLimit: 2, published: true } },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps)).toEqual(['1', '2']);
  });

  it('roundLimit filters schedule for all draw types', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    // Schedule all matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Publish event with roundLimit: 2
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: { [structureId]: { roundLimit: 2, published: true } },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    // Only rounds 1-2 should appear in schedule
    const roundNumbers = result.dateMatchUps.map((m) => m.roundNumber);
    expect(roundNumbers.every((r) => r <= 2)).toEqual(true);
    expect(roundNumbers.includes(1)).toEqual(true);
    expect(roundNumbers.includes(2)).toEqual(true);
  });

  it('scheduledRounds basic: explicitly unpublished rounds are hidden, unlisted pass through', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Publish with scheduledRounds: rounds 2 and 3 explicitly unpublished
    // Round 1 is unlisted → passes through normally
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: { 2: { published: false }, 3: { published: false } },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    const roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))];
    expect(roundNumbers).toEqual([1]);
  });

  it('scheduledRounds with embargo: round returned without schedule until embargo passes', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Publish with scheduledRounds: round 1 published, round 2 embargoed
    // Round 3 is unlisted → passes through normally
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                1: { published: true },
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    // Before embargo passes: all 3 rounds visible, round 2 has schedule stripped
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(roundNumbers).toEqual([1, 2, 3]);

    // Round 2 matchUps have no schedule
    const round2MatchUps = result.dateMatchUps.filter((m) => m.roundNumber === 2);
    expect(round2MatchUps.length).toBeGreaterThan(0);
    round2MatchUps.forEach((m) => expect(m.schedule).toBeUndefined());

    // Rounds 1 and 3 matchUps still have schedule
    const round1MatchUps = result.dateMatchUps.filter((m) => m.roundNumber === 1);
    round1MatchUps.forEach((m) => expect(m.schedule).toBeDefined());
    const round3MatchUps = result.dateMatchUps.filter((m) => m.roundNumber === 3);
    round3MatchUps.forEach((m) => expect(m.schedule).toBeDefined());

    // Advance time past the embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // After embargo passes: all 3 rounds visible, all have schedule
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(roundNumbers).toEqual([1, 2, 3]);

    // Round 2 now has schedule
    const round2After = result.dateMatchUps.filter((m) => m.roundNumber === 2);
    round2After.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('scheduledRounds + roundLimit interaction: roundLimit caps, scheduledRounds overrides within', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // roundLimit: 2 caps at round 2; scheduledRounds explicitly unpublishes round 2
    // Only round 1 should appear (round 3 blocked by roundLimit, round 2 explicitly unpublished)
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              roundLimit: 2,
              scheduledRounds: { 2: { published: false } },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    const roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))];
    expect(roundNumbers).toEqual([1]);
  });

  it('no scheduledRounds falls back to roundLimit', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // roundLimit: 2, no scheduledRounds → rounds 1-2 in schedule
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: { roundLimit: 2, published: true },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });

    const roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(roundNumbers).toEqual([1, 2]);
  });

  it('getPublishState exposes scheduledRound embargoes', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                1: { published: true },
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    const publishState = tournamentEngine.getPublishState().publishState;
    expect(publishState.embargoes).toBeDefined();
    expect(Array.isArray(publishState.embargoes)).toEqual(true);

    const scheduledRoundEmbargoes = publishState.embargoes.filter((e) => e.type === 'scheduledRound');
    expect(scheduledRoundEmbargoes.length).toEqual(1);

    const round2Embargo = scheduledRoundEmbargoes[0];
    expect(round2Embargo.id).toEqual(`${structureId}:round2`);
    expect(round2Embargo.embargo).toEqual(FUTURE_EMBARGO);
    expect(round2Embargo.embargoActive).toEqual(true);
  });

  it('full AD_HOC workflow: 3 rounds, roundLimit 2, progressive schedule publishing with embargo', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    // Schedule all matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Step 1: Publish with roundLimit: 2 and round 2 explicitly unpublished
    // Round 1 is unlisted → passes through; round 2 is explicitly hidden; round 3 blocked by roundLimit
    let result = tournamentEngine.publishEvent({
      removePriorValues: true,
      returnEventData: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              roundLimit: 2,
              scheduledRounds: {
                2: { published: false },
              },
            },
          },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);

    // Bracket shows only rounds 1-2 (AD_HOC roundLimit)
    const bracketRounds = Object.keys(result.eventData.drawsData[0].structures[0].roundMatchUps);
    expect(bracketRounds).toEqual(['1', '2']);

    // Publish order of play
    tournamentEngine.publishOrderOfPlay();

    // Schedule shows only round 1 (round 2 explicitly unpublished, round 3 capped by roundLimit)
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let scheduleRounds = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))];
    expect(scheduleRounds).toEqual([1]);

    // Step 2: Publish round 2 schedule with future embargo
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              roundLimit: 2,
              scheduledRounds: {
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    // Schedule shows rounds 1 and 2 (round 2 embargoed → schedule stripped)
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    scheduleRounds = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(scheduleRounds).toEqual([1, 2]);

    // Round 2 matchUps have schedule stripped
    const round2Embargoed = result.dateMatchUps.filter((m) => m.roundNumber === 2);
    round2Embargoed.forEach((m) => expect(m.schedule).toBeUndefined());

    // Round 1 matchUps still have schedule
    const round1 = result.dateMatchUps.filter((m) => m.roundNumber === 1);
    round1.forEach((m) => expect(m.schedule).toBeDefined());

    // Step 3: Advance past embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // Schedule now shows rounds 1 and 2, both with schedule data
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    scheduleRounds = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(scheduleRounds).toEqual([1, 2]);

    // Round 2 now has schedule
    const round2After = result.dateMatchUps.filter((m) => m.roundNumber === 2);
    round2After.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('embargoed round has schedule stripped but matchUp is returned', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    // Schedule all matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Only round 3 has an override (embargoed); rounds 1-2 are unlisted → pass through
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: { 3: { published: true, embargo: FUTURE_EMBARGO } },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    // Before embargo: all 3 rounds in results; round 3 has schedule stripped
    let result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    let roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(roundNumbers).toEqual([1, 2, 3]);

    // Round 3 matchUps have no schedule
    const round3Before = result.dateMatchUps.filter((m) => m.roundNumber === 3);
    expect(round3Before.length).toBeGreaterThan(0);
    round3Before.forEach((m) => expect(m.schedule).toBeUndefined());

    // Rounds 1 and 2 have schedule intact
    result.dateMatchUps
      .filter((m) => m.roundNumber === 1 || m.roundNumber === 2)
      .forEach((m) => expect(m.schedule).toBeDefined());

    // Advance time past the embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // After embargo: all 3 rounds in results; all have schedule
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    roundNumbers = [...new Set(result.dateMatchUps.map((m) => m.roundNumber))].sort();
    expect(roundNumbers).toEqual([1, 2, 3]);

    // All matchUps now have schedule
    result.dateMatchUps.forEach((m) => expect(m.schedule).toBeDefined());
  });

  // ============================================================
  // getEventData tests — verify the same embargo behavior through
  // the getEventData({ usePublishState: true }) code path, which
  // is the path used by courthive-public.
  // ============================================================

  it('getEventData: scheduledRounds embargo strips schedule from matchUps', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    // Schedule all matchUps
    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Publish with round 2 schedule embargoed
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                1: { published: true },
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    // Retrieve via getEventData (the courthive-public path)
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const structure = eventData.drawsData[0].structures[0];
    const roundMatchUps = structure.roundMatchUps;

    // Round 1 matchUps should have schedule
    const round1 = roundMatchUps[1] || [];
    expect(round1.length).toBeGreaterThan(0);
    round1.forEach((m) => expect(m.schedule).toBeDefined());

    // Round 2 matchUps should have schedule STRIPPED
    const round2 = roundMatchUps[2] || [];
    expect(round2.length).toBeGreaterThan(0);
    round2.forEach((m) => expect(m.schedule).toBeUndefined());

    // Round 3 (unlisted in scheduledRounds) should still have schedule
    const round3 = roundMatchUps[3] || [];
    expect(round3.length).toBeGreaterThan(0);
    round3.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('getEventData: embargo expiry restores schedule', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    // Before embargo expires: round 2 schedule stripped
    let { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    let round2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    expect(round2.length).toBeGreaterThan(0);
    round2.forEach((m) => expect(m.schedule).toBeUndefined());

    // Advance time past the embargo
    vi.setSystemTime(new Date(AFTER_EMBARGO).getTime());

    // After embargo expires: round 2 schedule restored
    ({ eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true }));
    round2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    expect(round2.length).toBeGreaterThan(0);
    round2.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('getEventData: elimination draw with scheduledRounds embargo strips schedule', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      venueProfiles: [{ courtsCount: 4 }],
      startDate: START_DATE,
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const structureId = event.drawDefinitions[0].structures[0].structureId;

    // Embargo round 1 schedule in an elimination draw
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                1: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const structure = eventData.drawsData[0].structures[0];
    const roundMatchUps = structure.roundMatchUps;

    // Round 1: schedule stripped (embargoed)
    const round1 = roundMatchUps[1] || [];
    expect(round1.length).toBeGreaterThan(0);
    round1.forEach((m) => expect(m.schedule).toBeUndefined());

    // Round 2: not embargoed, so schedule should NOT be stripped
    const round2 = roundMatchUps[2] || [];
    if (round2.length) {
      const round2Scheduled = round2.filter((m) => m.schedule);
      expect(round2Scheduled.length).toEqual(round2.length);
    }
  });

  it('getEventData: without usePublishState returns schedule regardless of embargo', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });

    // Without usePublishState: schedule is NOT stripped even for embargoed rounds
    const { eventData } = tournamentEngine.getEventData({ eventId });
    const round2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    expect(round2.length).toBeGreaterThan(0);
    round2.forEach((m) => expect(m.schedule).toBeDefined());
  });

  it('getEventData + competitionScheduleMatchUps: consistent embargo behavior', () => {
    const {
      tournamentRecord,
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
    });

    tournamentEngine.setState(tournamentRecord);

    const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];
    const matchUpIds = getMatchUpIds(allMatchUps);
    tournamentEngine.scheduleMatchUps({ scheduleDate: START_DATE, matchUpIds });

    const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

    // Embargo round 2
    tournamentEngine.publishEvent({
      removePriorValues: true,
      drawDetails: {
        [drawId]: {
          structureDetails: {
            [structureId]: {
              published: true,
              scheduledRounds: {
                2: { published: true, embargo: FUTURE_EMBARGO },
              },
            },
          },
        },
      },
      eventId,
    });
    tournamentEngine.publishOrderOfPlay();

    // getEventData path
    const { eventData } = tournamentEngine.getEventData({ eventId, usePublishState: true });
    const edRound2 = eventData.drawsData[0].structures[0].roundMatchUps[2] || [];
    const edRound1 = eventData.drawsData[0].structures[0].roundMatchUps[1] || [];

    // competitionScheduleMatchUps path
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
    });
    const csmRound2 = result.dateMatchUps.filter((m) => m.roundNumber === 2);
    const csmRound1 = result.dateMatchUps.filter((m) => m.roundNumber === 1);

    // Both paths should agree: round 2 schedule stripped, round 1 schedule intact
    edRound2.forEach((m) => expect(m.schedule).toBeUndefined());
    csmRound2.forEach((m) => expect(m.schedule).toBeUndefined());

    edRound1.forEach((m) => expect(m.schedule).toBeDefined());
    csmRound1.forEach((m) => expect(m.schedule).toBeDefined());
  });
});
