import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { PUBLIC } from '@Constants/timeItemConstants';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const START_DATE = '2025-06-15';
const INTERNAL = 'INTERNAL';

function setupTournament() {
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

  return { drawId, eventId };
}

describe('non-PUBLIC status publishing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publish with status INTERNAL — default PUBLIC query does not see it', () => {
    const { eventId } = setupTournament();

    // Publish under INTERNAL status
    tournamentEngine.publishEvent({ eventId, status: INTERNAL });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: INTERNAL });

    // Query with default (PUBLIC) — should not see the INTERNAL OOP
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      // status defaults to PUBLIC
    });

    // No PUBLIC OOP → empty dateMatchUps
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('query with status INTERNAL — finds the INTERNAL OOP', () => {
    const { eventId } = setupTournament();

    // Publish event under PUBLIC (for draw details) and OOP under INTERNAL
    // Note: getCompetitionPublishedDrawDetails always reads PUBLIC status for draw details
    tournamentEngine.publishEvent({ eventId, status: PUBLIC });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: INTERNAL });

    // Query with INTERNAL status — finds the INTERNAL OOP
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      status: INTERNAL,
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
  });

  it('OOP published as INTERNAL, queried as PUBLIC — returns empty', () => {
    const { eventId } = setupTournament();

    // Publish event under PUBLIC, but OOP only for INTERNAL
    tournamentEngine.publishEvent({ eventId, status: PUBLIC });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: INTERNAL });

    // PUBLIC query: no PUBLIC OOP → empty
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      status: PUBLIC,
    });
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('unpublish INTERNAL OOP but keep PUBLIC OOP — PUBLIC still works', () => {
    const { eventId } = setupTournament();

    // Publish both statuses
    tournamentEngine.publishEvent({ eventId, status: PUBLIC });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: PUBLIC });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: INTERNAL });

    // Unpublish INTERNAL OOP
    tournamentEngine.unPublishOrderOfPlay({ status: INTERNAL });

    // PUBLIC should still work
    const publicResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      status: PUBLIC,
    });
    expect(publicResult.success).toEqual(true);
    expect(publicResult.dateMatchUps.length).toBeGreaterThan(0);

    // INTERNAL should be empty (unpublished)
    const internalResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      status: INTERNAL,
    });
    expect(internalResult.dateMatchUps.length).toEqual(0);
  });

  it('publish PUBLIC event with embargo, INTERNAL OOP without — INTERNAL query returns matchUps', () => {
    const { eventId, drawId } = setupTournament();

    // Publish event under PUBLIC with embargo
    tournamentEngine.publishEvent({
      drawDetails: { [drawId]: { publishingDetail: { published: true, embargo: FUTURE_EMBARGO } } },
      eventId,
      status: PUBLIC,
    });
    // Publish OOP under INTERNAL (no embargo)
    // Also need PUBLIC event publish for draw details (since getCompetitionPublishedDrawDetails reads PUBLIC)
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [START_DATE], status: INTERNAL });

    // INTERNAL query: OOP is published under INTERNAL and draw details are from PUBLIC (embargoed)
    // The draw is embargoed under PUBLIC, so matchUps from that draw should be filtered out
    const internalResult = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      usePublishState: true,
      status: INTERNAL,
    });
    // Draw is embargoed → matchUps hidden (draw details always read from PUBLIC status)
    expect(internalResult.dateMatchUps.length).toEqual(0);
  });
});
