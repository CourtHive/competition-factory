import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INVALID_EMBARGO } from '@Constants/errorConditionConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const PAST_EMBARGO = '2025-06-10T12:00:00Z';

describe('embargo enforcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draw embargo (future): hides draws from getEventData', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawId }],
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);

    // drawsData should be empty because the draw is embargoed
    expect(result.eventData.drawsData?.length ?? 0).toEqual(0);
  });

  it('draw embargo (past/expired): draw IS visible', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawId }],
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: PAST_EMBARGO },
        },
      },
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.eventData.drawsData.length).toEqual(1);
    expect(result.eventData.drawsData[0].drawId).toEqual(drawId);
  });

  it('draw no embargo: backward compatibility', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.eventData.drawsData.length).toEqual(1);
    expect(result.eventData.drawsData[0].drawId).toEqual(drawId);
  });

  it('stage embargo: hides qualifying structures, shows main', () => {
    const drawId = 'drawId';
    const {
      tournamentRecord,
      drawIds: [generatedDrawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
    });

    tournamentEngine.setState(tournamentRecord);
    const event = tournamentEngine.getEvent({ drawId: generatedDrawId }).event;
    const eventId = event.eventId;

    // Publish with QUALIFYING stage embargoed (future)
    let result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            [QUALIFYING]: { published: true, embargo: FUTURE_EMBARGO },
            [MAIN]: { published: true },
          },
        },
      },
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);

    const stages = result.eventData.drawsData[0].structures.map(({ stage }) => stage);
    expect(stages).toContain(MAIN);
    expect(stages).not.toContain(QUALIFYING);
  });

  it('structure embargo: hides embargoed structure', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const drawDefinition = event.drawDefinitions.find((d) => d.drawId === drawId);
    const structureId = drawDefinition.structures[0].structureId;

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [structureId]: { published: true, embargo: FUTURE_EMBARGO },
          },
        },
      },
      returnEventData: true,
      eventId,
    });
    expect(result.success).toEqual(true);

    // The embargoed structure should be filtered out
    const structureIds = result.eventData.drawsData?.[0]?.structures?.map((s) => s.structureId) ?? [];
    expect(structureIds).not.toContain(structureId);
  });

  it('orderOfPlay embargo: competitionScheduleMatchUps returns empty dateMatchUps', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const events = tournamentEngine.getEvents().events;
    const eventId = events[0].eventId;

    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ embargo: FUTURE_EMBARGO });

    const result = tournamentEngine.competitionScheduleMatchUps({ usePublishState: true });
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('participants embargo: getPublishState still reports published with embargo metadata', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    tournamentEngine.publishParticipants({ embargo: FUTURE_EMBARGO });

    const publishState = tournamentEngine.getPublishState().publishState;
    // participants should still be reported as published (ignoreEmbargo in reporting)
    expect(publishState.tournament?.participants?.published).toEqual(true);
    expect(publishState.tournament?.participants?.embargo).toEqual(FUTURE_EMBARGO);
  });

  it('getPublishState exposes embargoes array', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      eventId,
    });

    tournamentEngine.publishOrderOfPlay({ embargo: FUTURE_EMBARGO });
    tournamentEngine.publishParticipants({ embargo: PAST_EMBARGO });

    const publishState = tournamentEngine.getPublishState().publishState;
    expect(publishState.embargoes).toBeDefined();
    expect(Array.isArray(publishState.embargoes)).toEqual(true);

    const types = publishState.embargoes.map((e) => e.type);
    expect(types).toContain('orderOfPlay');
    expect(types).toContain('participants');
    expect(types).toContain('draw');

    const oopEmbargo = publishState.embargoes.find((e) => e.type === 'orderOfPlay');
    expect(oopEmbargo.embargo).toEqual(FUTURE_EMBARGO);
    expect(oopEmbargo.embargoActive).toEqual(true);

    const participantsEmbargo = publishState.embargoes.find((e) => e.type === 'participants');
    expect(participantsEmbargo.embargo).toEqual(PAST_EMBARGO);
    expect(participantsEmbargo.embargoActive).toEqual(false);

    const drawEmbargo = publishState.embargoes.find((e) => e.type === 'draw');
    expect(drawEmbargo.id).toEqual(drawId);
    expect(drawEmbargo.embargoActive).toEqual(true);
  });

  it('embargo expiry via fake timers: hidden then visible', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: FUTURE_EMBARGO },
        },
      },
      eventId,
    });

    // Before embargo expires: draw hidden
    let eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
    expect(eventData.drawsData?.length ?? 0).toEqual(0);

    // Advance time past the embargo
    vi.setSystemTime(new Date('2025-06-21T00:00:00Z').getTime());

    // After embargo expires: draw visible
    eventData = tournamentEngine.getEventData({ eventId, usePublishState: true }).eventData;
    expect(eventData.drawsData.length).toEqual(1);
    expect(eventData.drawsData[0].drawId).toEqual(drawId);
  });

  it('competitionScheduleMatchUps: stage/structure embargo filters matchUps', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }],
        },
      ],
      setState: true,
    });

    const event = tournamentEngine.getEvent({ drawId }).event;
    const eventId = event.eventId;

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

    tournamentEngine.publishOrderOfPlay();

    const result = tournamentEngine.competitionScheduleMatchUps({ usePublishState: true });

    // No qualifying matchUps should be present
    const qualifyingMatchUps = (result.dateMatchUps ?? []).filter((m) => m.stage === QUALIFYING);
    expect(qualifyingMatchUps.length).toEqual(0);
  });

  it('rejects embargo without timezone indicator', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: '2025-06-20T12:00:00' },
        },
      },
      eventId,
    });
    expect(result.error).toEqual(INVALID_EMBARGO);
  });

  it('rejects non-ISO embargo string', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: 'June 20, 2025' },
        },
      },
      eventId,
    });
    expect(result.error).toEqual(INVALID_EMBARGO);
  });

  it('accepts embargo with Z suffix', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: '2025-06-20T12:00:00Z' },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('accepts embargo with positive offset', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: '2025-06-20T12:00:00+05:30' },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('accepts embargo with negative offset', () => {
    const drawId = 'draw1';
    const eventId = 'event1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const result = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true, embargo: '2025-06-20T08:00:00-04:00' },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('rejects embargo at orderOfPlay level without timezone', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const result = tournamentEngine.publishOrderOfPlay({ embargo: '2025-06-20T12:00:00' });
    expect(result.error).toEqual(INVALID_EMBARGO);
  });

  it('rejects embargo at participants level without timezone', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });

    const result = tournamentEngine.publishParticipants({ embargo: '2025-06-20T12:00:00' });
    expect(result.error).toEqual(INVALID_EMBARGO);
  });
});
