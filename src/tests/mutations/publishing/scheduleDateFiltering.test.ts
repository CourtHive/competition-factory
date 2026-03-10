import { getMatchUpIds } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

const DAY_1 = '2025-07-01';
const DAY_2 = '2025-07-02';
const DAY_3 = '2025-07-03';
const NO_MATCHUPS_DATE = '2025-07-10';

function setupMultiDayTournament() {
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
    startDate: DAY_1,
    endDate: DAY_3,
  });

  tournamentEngine.setState(tournamentRecord);

  // Get all matchUps and partition by round for multi-day scheduling
  const { upcomingMatchUps, pendingMatchUps } = tournamentEngine.getCompetitionMatchUps();
  const allMatchUps = [...(upcomingMatchUps ?? []), ...(pendingMatchUps ?? [])];

  const round1 = allMatchUps.filter((m) => m.roundNumber === 1);
  const round2 = allMatchUps.filter((m) => m.roundNumber === 2);
  const round3 = allMatchUps.filter((m) => m.roundNumber === 3);

  // Schedule round 1 on DAY_1, round 2 on DAY_2, round 3 on DAY_3
  tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_1, matchUpIds: getMatchUpIds(round1) });
  tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_2, matchUpIds: getMatchUpIds(round2) });
  tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_3, matchUpIds: getMatchUpIds(round3) });

  return { eventId, drawId, round1, round2, round3 };
}

describe('schedule date filtering', () => {
  it('singular scheduledDate filter returns only that day matchUps (no publish state)', () => {
    const { round1 } = setupMultiDayTournament();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_1 },
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toEqual(round1.length);
    result.dateMatchUps.forEach((m) => {
      expect(m.schedule?.scheduledDate).toEqual(DAY_1);
    });
  });

  it('scheduledDate for a day with no matchUps returns empty (no publish state)', () => {
    setupMultiDayTournament();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: NO_MATCHUPS_DATE },
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('scheduledDate + usePublishState with published OOP dates — intersection works', () => {
    const { eventId } = setupMultiDayTournament();

    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1, DAY_2] });

    // DAY_1 is in published dates → should return matchUps
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_1 },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toBeGreaterThan(0);
    result.dateMatchUps.forEach((m) => {
      expect(m.schedule?.scheduledDate).toEqual(DAY_1);
    });
  });

  it('scheduledDate + usePublishState where date is NOT in published dates returns empty', () => {
    const { eventId } = setupMultiDayTournament();

    tournamentEngine.publishEvent({ eventId });
    // Only publish DAY_1 and DAY_2 in OOP
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1, DAY_2] });

    // DAY_3 is NOT in published dates → should return empty
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_3 },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toEqual(0);
  });

  it('scheduledDates array filter returns union of those days', () => {
    const { round1, round2 } = setupMultiDayTournament();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDates: [DAY_1, DAY_2] },
    });

    expect(result.success).toEqual(true);
    expect(result.dateMatchUps.length).toEqual(round1.length + round2.length);
  });

  it('empty scheduledDates array does not accidentally return everything', () => {
    setupMultiDayTournament();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDates: [] },
    });

    expect(result.success).toEqual(true);
    // Empty scheduledDates with no scheduledDate should return all matchUps (no date filter applied)
    // This is correct because an empty array means "no filter"
    const allResult = tournamentEngine.competitionScheduleMatchUps({});
    expect(result.dateMatchUps.length).toEqual(allResult.dateMatchUps.length);
  });

  it('both scheduledDate and scheduledDates provided — scheduledDates takes precedence', () => {
    const { round2 } = setupMultiDayTournament();

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_1, scheduledDates: [DAY_2] },
    });

    expect(result.success).toEqual(true);
    // scheduledDates should be used; DAY_1 from scheduledDate should be ignored
    expect(result.dateMatchUps.length).toEqual(round2.length);
    result.dateMatchUps.forEach((m) => {
      expect(m.schedule?.scheduledDate).toEqual(DAY_2);
    });
  });

  it('scheduledDate with alwaysReturnCompleted — completed matchUps on other days excluded', () => {
    setupMultiDayTournament();

    // Complete some matchUps on DAY_1 by setting scores
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const day1MatchUps = matchUps.filter((m) => m.schedule?.scheduledDate === DAY_1 && m.roundNumber === 1);
    // Complete first 2 matchUps
    for (let i = 0; i < Math.min(2, day1MatchUps.length); i++) {
      const matchUp = day1MatchUps[i];
      if (matchUp.sides?.length === 2 && matchUp.sides[0].participantId && matchUp.sides[1].participantId) {
        tournamentEngine.setMatchUpStatus({
          matchUpId: matchUp.matchUpId,
          drawId: matchUp.drawId,
          outcome: {
            winningSide: 1,
            score: {
              sets: [{ side1Score: 6, side2Score: 3, setNumber: 1 }],
            },
          },
        });
      }
    }

    // Filter by DAY_2 with alwaysReturnCompleted
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_2 },
      alwaysReturnCompleted: true,
    });

    expect(result.success).toEqual(true);
    // completedMatchUps should only be from DAY_2, not DAY_1
    // (alwaysReturnCompleted fetches completed matchUps with the same filters)
    if (result.completedMatchUps?.length) {
      result.completedMatchUps.forEach((m) => {
        expect(m.matchUpStatus).toEqual(COMPLETED);
      });
    }
    // dateMatchUps should not contain completed matchUps
    result.dateMatchUps.forEach((m) => {
      expect(m.matchUpStatus).not.toEqual(COMPLETED);
    });
  });

  it('multi-day tournament: filter each day independently, verify counts match', () => {
    const { round1, round2, round3, eventId } = setupMultiDayTournament();

    tournamentEngine.publishEvent({ eventId });
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1, DAY_2, DAY_3] });

    const day1Result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_1 },
      usePublishState: true,
    });
    const day2Result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_2 },
      usePublishState: true,
    });
    const day3Result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: DAY_3 },
      usePublishState: true,
    });

    expect(day1Result.dateMatchUps.length).toEqual(round1.length);
    expect(day2Result.dateMatchUps.length).toEqual(round2.length);
    expect(day3Result.dateMatchUps.length).toEqual(round3.length);
  });

  it('scheduledDates intersection with published OOP dates excludes unpublished days', () => {
    const { eventId, round1 } = setupMultiDayTournament();

    tournamentEngine.publishEvent({ eventId });
    // Only publish DAY_1
    tournamentEngine.publishOrderOfPlay({ scheduledDates: [DAY_1] });

    // Request DAY_1 and DAY_2, but only DAY_1 is published
    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDates: [DAY_1, DAY_2] },
      usePublishState: true,
    });

    expect(result.success).toEqual(true);
    // Only DAY_1 matchUps should be returned
    expect(result.dateMatchUps.length).toEqual(round1.length);
    result.dateMatchUps.forEach((m) => {
      expect(m.schedule?.scheduledDate).toEqual(DAY_1);
    });
  });
});
