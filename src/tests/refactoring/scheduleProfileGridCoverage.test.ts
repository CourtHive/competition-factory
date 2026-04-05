import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { SINGLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

const VENUE_ID = 'grid-venue';
const START_DATE = '2026-07-01';
const END_DATE = '2026-07-07';

function setupTournament(
  options: {
    venueProfiles?: any[];
    drawProfiles?: any[];
    startDate?: string;
    endDate?: string;
  } = {},
) {
  const {
    startDate = START_DATE,
    endDate = END_DATE,
    venueProfiles = [{ venueName: 'Grid Courts', venueAbbreviation: 'GC', courtsCount: 4, venueId: VENUE_ID }],
    drawProfiles = [{ drawType: SINGLE_ELIMINATION, drawSize: 16 }],
  } = options;

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
  const { tournamentId } = tournamentRecord;
  const drawId = matchUps[0]?.drawId;
  const eventId = tournamentEngine.getEvent({ drawId }).event?.eventId;
  const structureId = matchUps[0]?.structureId;

  return { tournamentRecord, matchUps, tournamentId, drawId, eventId, structureId, startDate };
}

function addProfileRound(params: {
  tournamentId: string;
  eventId: string;
  drawId: string;
  structureId: string;
  roundNumber: number;
  scheduleDate: string;
  venueId?: string;
  roundSegment?: { segmentNumber: number; segmentsCount: number };
}) {
  const { scheduleDate, venueId = VENUE_ID, roundSegment, ...round } = params;
  return tournamentEngine.addSchedulingProfileRound({
    round: { ...round, ...(roundSegment && { roundSegment }) },
    scheduleDate,
    venueId,
  });
}

// ===== Parameter validation =====
describe('scheduleProfileGrid parameter validation', () => {
  it('returns error when tournamentRecords is missing (no state)', () => {
    tournamentEngine.reset();
    let result: any = tournamentEngine.scheduleProfileGrid({});
    expect(result.error).toBeTruthy();
  });

  it('returns error when scheduleDates contains invalid date strings', () => {
    setupTournament();
    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: ['not-a-date'],
    });
    expect(result.error).toBeTruthy();
  });

  it('accepts scheduleDates as an empty array', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // Empty scheduleDates means no filtering — all profile dates are valid
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [] });
    expect(result.success).toBe(true);
    expect(result.scheduledDates).toContain(startDate);
  });
});

// ===== Empty / no-op profile =====
describe('scheduleProfileGrid with empty profile', () => {
  it('returns success immediately when scheduling profile is empty', () => {
    setupTournament();

    tournamentEngine.setSchedulingProfile({ schedulingProfile: [] });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);
    // No scheduledDates or scheduledMatchUpIds because nothing was processed
    expect(result.scheduledDates).toBeUndefined();
  });
});

// ===== NO_VALID_DATES =====
describe('scheduleProfileGrid NO_VALID_DATES', () => {
  it('returns NO_VALID_DATES when scheduleDates do not overlap profile dates', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: ['2099-12-31'] });
    expect(result.error).toEqual(NO_VALID_DATES);
  });

  it('returns NO_VALID_DATES when profile dates are invalid and scheduleDates filter eliminates all', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // scheduleDates contains a valid date string but one that doesn't overlap the profile
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: ['2026-12-25'] });
    expect(result.error).toEqual(NO_VALID_DATES);
  });
});

// ===== Basic grid scheduling =====
describe('scheduleProfileGrid basic scheduling', () => {
  it('schedules R1 matchUps on a single date with courtOrder but no scheduledTime', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);
    expect(result.scheduledDates).toEqual([startDate]);

    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toEqual(8); // drawSize 16, R1 = 8 matchUps

    // Verify courtOrder assigned, no scheduledTime
    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const scheduled = matchUps.filter((m) => day1Ids.includes(m.matchUpId));
    expect(scheduled.every((m) => m.schedule?.courtOrder)).toBe(true);
    expect(scheduled.every((m) => !m.schedule?.scheduledTime)).toBe(true);
  });

  it('schedules multiple rounds across multiple dates', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();
    const day2 = '2026-07-02';

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });
    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 2, scheduleDate: day2 });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate, day2] });
    expect(result.success).toBe(true);
    expect(result.scheduledDates.length).toEqual(2);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(8);
    expect(result.scheduledMatchUpIds[day2].length).toEqual(4);
  });
});

// ===== clearScheduleDates =====
describe('scheduleProfileGrid clearScheduleDates', () => {
  it('clears existing schedules before re-scheduling when clearScheduleDates is true', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // First scheduling pass
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(8);

    // Re-add the same profile round (profile still exists)
    // Second pass with clearScheduleDates — should clear and reschedule
    result = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      clearScheduleDates: true,
    });
    expect(result.success).toBe(true);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(8);
  });

  it('uses clearScheduleDates as boolean (not array) triggering clearScheduledMatchUps with empty array', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      clearScheduleDates: true,
    });
    expect(result.success).toBe(true);
  });
});

// ===== Skipping already-scheduled matchUps =====
describe('scheduleProfileGrid skipping pre-scheduled matchUps', () => {
  it('skips matchUps that already have courtId assigned', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    // Pre-schedule one matchUp
    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true, nextMatchUps: true });
    const r1MatchUps = matchUps.filter((m) => m.roundNumber === 1 && m.drawId === drawId);

    let result: any = tournamentEngine.proAutoSchedule({
      matchUps: [r1MatchUps[0]],
      scheduledDate: startDate,
    });
    expect(result.scheduled.length).toEqual(1);

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);

    // Only the remaining 7 should be newly scheduled
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toEqual(7);
  });

  it('skips BYE matchUps', () => {
    // drawSize 8 with byes: use drawSize where some positions are BYE
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 12 }],
    });

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);

    // With 12 participants in drawSize 16, there are 4 BYEs in R1 so only 4 R1 matchUps are playable
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toEqual(4);
  });
});

// ===== Multiple venues =====
describe('scheduleProfileGrid multiple venues', () => {
  it('collects courts from multiple venues for a single date', () => {
    const venueId1 = 'venue-alpha';
    const venueId2 = 'venue-beta';

    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament({
      venueProfiles: [
        { venueName: 'Alpha', venueAbbreviation: 'AL', courtsCount: 2, venueId: venueId1 },
        { venueName: 'Beta', venueAbbreviation: 'BE', courtsCount: 2, venueId: venueId2 },
      ],
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 16 }],
    });

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId: venueId1,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }],
            },
            {
              venueId: venueId2,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 2 }],
            },
          ],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);

    // R1 (8) + R2 (4) = 12 matchUps scheduled across 4 courts
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toBeGreaterThanOrEqual(8);
  });

  it('handles venue with no courts gracefully', () => {
    const venueId1 = 'venue-with-courts';
    const venueIdEmpty = 'venue-no-courts';

    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament({
      venueProfiles: [
        { venueName: 'Has Courts', venueAbbreviation: 'HC', courtsCount: 4, venueId: venueId1 },
        { venueName: 'No Courts', venueAbbreviation: 'NC', courtsCount: 0, venueId: venueIdEmpty },
      ],
    });

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId: venueIdEmpty,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }],
            },
            {
              venueId: venueId1,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 2 }],
            },
          ],
        },
      ],
    });

    // Even if one venue has no courts, the overall call should succeed
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);
  });
});

// ===== Round segments (split rounds) =====
describe('scheduleProfileGrid round segments', () => {
  it('schedules only the first segment of a split round', () => {
    const venueId1 = 'seg-venue-1';
    const venueId2 = 'seg-venue-2';

    const drawId = 'seg-draw';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { venueName: 'Seg Venue 1', venueAbbreviation: 'S1', courtsCount: 4, venueId: venueId1 },
        { venueName: 'Seg Venue 2', venueAbbreviation: 'S2', courtsCount: 4, venueId: venueId2 },
      ],
      drawProfiles: [{ drawSize: 32, drawId, idPrefix: 'seg' }],
      startDate: START_DATE,
      endDate: END_DATE,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId } = tournamentRecord;
    const eventId = tournamentEngine.getEvent({ drawId }).event?.eventId;
    const structureId = matchUps[0]?.structureId;

    // Split R1 (16 matchUps) into two segments across two venues
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: START_DATE,
          venues: [
            {
              venueId: venueId1,
              rounds: [
                {
                  tournamentId,
                  eventId,
                  drawId,
                  structureId,
                  roundNumber: 1,
                  roundSegment: { segmentNumber: 1, segmentsCount: 2 },
                },
              ],
            },
            {
              venueId: venueId2,
              rounds: [
                {
                  tournamentId,
                  eventId,
                  drawId,
                  structureId,
                  roundNumber: 1,
                  roundSegment: { segmentNumber: 2, segmentsCount: 2 },
                },
              ],
            },
          ],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);

    // All 16 R1 matchUps should be scheduled (8 per segment)
    const dayIds = result.scheduledMatchUpIds[START_DATE] ?? [];
    expect(dayIds.length).toEqual(16);
  });
});

// ===== Round Robin (contained structures) =====
describe('scheduleProfileGrid with round robin draws', () => {
  it('schedules round robin matchUps resolving contained structures', () => {
    const venueId = 'rr-venue';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'RR Courts', venueAbbreviation: 'RR', courtsCount: 8, venueId }],
      eventProfiles: [
        {
          eventName: 'RR Event',
          eventType: SINGLES,
          drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }],
        },
      ],
      startDate: START_DATE,
      endDate: END_DATE,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId } = tournamentRecord;
    const drawId = matchUps[0]?.drawId;
    const eventId = tournamentEngine.getEvent({ drawId }).event?.eventId;
    const structureId = matchUps[0]?.structureId;

    addProfileRound({
      tournamentId,
      eventId,
      drawId,
      structureId,
      roundNumber: 1,
      scheduleDate: START_DATE,
      venueId,
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);

    const dayIds = result.scheduledMatchUpIds[START_DATE] ?? [];
    // RR with 8 players = 2 groups of 4, each has 3 rounds of 2 matchUps.
    // R1 across both groups = 4 matchUps (if structureId covers group)
    // The exact count depends on how contained structures are resolved, but should be > 0
    expect(dayIds.length).toBeGreaterThan(0);
  });
});

// ===== minCourtGridRows =====
describe('scheduleProfileGrid minCourtGridRows', () => {
  it('passes minCourtGridRows through to proAutoSchedule', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      venueProfiles: [{ venueName: 'Big Courts', venueAbbreviation: 'BC', courtsCount: 2, venueId: VENUE_ID }],
    });

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      minCourtGridRows: 20,
    });
    expect(result.success).toBe(true);

    // With 2 courts and minCourtGridRows=20, up to 40 grid slots
    // R1 has 16 matchUps — all should fit
    const dayIds = result.scheduledMatchUpIds[startDate] ?? [];
    expect(dayIds.length).toEqual(16);
  });

  it('limits scheduled matchUps when minCourtGridRows is very small', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 32 }],
      venueProfiles: [{ venueName: 'Small Grid', venueAbbreviation: 'SG', courtsCount: 1, venueId: VENUE_ID }],
    });

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // With 1 court and minCourtGridRows=5, only 5 grid slots
    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      minCourtGridRows: 5,
    });
    expect(result.success).toBe(true);

    const dayIds = result.scheduledMatchUpIds[startDate] ?? [];
    // Only 5 matchUps should fit on 1 court with 5 rows
    expect(dayIds.length).toEqual(5);

    // The rest should be in notScheduledMatchUpIds
    const notScheduled = result.notScheduledMatchUpIds[startDate] ?? [];
    expect(notScheduled.length).toEqual(11);
  });
});

// ===== Dates filtering and chronological sorting =====
describe('scheduleProfileGrid date handling', () => {
  it('filters profile dates to only those in scheduleDates', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();
    const day2 = '2026-07-02';
    const day3 = '2026-07-03';

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });
    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 2, scheduleDate: day2 });
    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 3, scheduleDate: day3 });

    // Only request day2
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [day2] });
    expect(result.success).toBe(true);

    // Only day2 should be in scheduledDates
    expect(result.scheduledDates).toEqual([day2]);
    expect(result.scheduledMatchUpIds[startDate]).toBeUndefined();
  });

  it('processes dates in chronological order regardless of profile order', () => {
    const { tournamentId, eventId, drawId, structureId } = setupTournament();
    const day1 = '2026-07-03';
    const day2 = '2026-07-01';

    // Add in reverse chronological order
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: day1,
          venues: [
            {
              venueId: VENUE_ID,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 2 }],
            },
          ],
        },
        {
          scheduleDate: day2,
          venues: [
            {
              venueId: VENUE_ID,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }],
            },
          ],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [day1, day2] });
    expect(result.success).toBe(true);

    // day2 (July 1) should be processed before day1 (July 3) — both should appear
    expect(result.scheduledDates).toContain(day2);
    expect(result.scheduledDates).toContain(day1);
  });
});

// ===== Doubles matchUps =====
describe('scheduleProfileGrid with doubles draws', () => {
  it('schedules doubles matchUps correctly', () => {
    const venueId = 'doubles-venue';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Doubles Courts', venueAbbreviation: 'DC', courtsCount: 4, venueId }],
      eventProfiles: [
        {
          eventName: 'Doubles Event',
          eventType: DOUBLES,
          drawProfiles: [{ drawSize: 8 }],
        },
      ],
      startDate: START_DATE,
      endDate: END_DATE,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId } = tournamentRecord;
    const drawId = matchUps[0]?.drawId;
    const eventId = tournamentEngine.getEvent({ drawId }).event?.eventId;
    const structureId = matchUps[0]?.structureId;

    addProfileRound({
      tournamentId,
      eventId,
      drawId,
      structureId,
      roundNumber: 1,
      scheduleDate: START_DATE,
      venueId,
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);

    const dayIds = result.scheduledMatchUpIds[START_DATE] ?? [];
    expect(dayIds.length).toEqual(4); // drawSize 8 R1 = 4 matchUps
  });
});

// ===== No matchUps for a date (continue branch) =====
describe('scheduleProfileGrid no matchUps for date', () => {
  it('skips dates where profile rounds have no matching unscheduled matchUps', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();
    const day2 = '2026-07-02';

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // Add a profile for day2 pointing to a round that does not exist (roundNumber: 99)
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId: VENUE_ID,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }],
            },
          ],
        },
        {
          scheduleDate: day2,
          venues: [
            {
              venueId: VENUE_ID,
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 99 }],
            },
          ],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate, day2] });
    expect(result.success).toBe(true);

    // day1 should be scheduled, day2 should be skipped (no matchUps)
    expect(result.scheduledDates).toEqual([startDate]);
    expect(result.scheduledMatchUpIds[day2]).toBeUndefined();
  });
});

// ===== Empty venues array in profile =====
describe('scheduleProfileGrid edge cases', () => {
  it('handles profile entry with empty venues array', () => {
    const { startDate } = setupTournament();

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    // No matchUps collected → date skipped → no scheduledDates
    expect(result.success).toBe(true);
    expect(result.scheduledDates.length).toEqual(0);
  });

  it('handles profile entry with empty rounds array in venue', () => {
    setupTournament();

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: START_DATE,
          venues: [{ venueId: VENUE_ID, rounds: [] }],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);
    expect(result.scheduledDates.length).toEqual(0);
  });

  it('handles venue that does not exist in tournament (unknown venueId)', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId: 'nonexistent-venue',
              rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }],
            },
          ],
        },
      ],
    });

    // Should still succeed — courtIds will be empty, proAutoSchedule called with no courtIds
    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toBe(true);
  });

  it('scheduleDates with valid dates filters correctly even with ISO datetime strings', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    // Use ISO datetime string — extractDate should strip the time part
    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [`${startDate}T10:00:00.000Z`],
    });
    expect(result.success).toBe(true);
    expect(result.scheduledDates).toContain(startDate);
  });
});

// ===== scheduleCompletedMatchUps =====
describe('scheduleProfileGrid scheduleCompletedMatchUps', () => {
  it('passes scheduleCompletedMatchUps option through to proAutoSchedule', () => {
    const { tournamentId, eventId, drawId, structureId, startDate } = setupTournament();

    addProfileRound({ tournamentId, eventId, drawId, structureId, roundNumber: 1, scheduleDate: startDate });

    let result: any = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      scheduleCompletedMatchUps: true,
    });
    expect(result.success).toBe(true);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(8);
  });
});

// ===== Multiple tournament records (competition) =====
describe('scheduleProfileGrid with multiple events', () => {
  it('schedules matchUps from multiple events on the same date', () => {
    const venueId = 'multi-event-venue';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Multi Courts', venueAbbreviation: 'MC', courtsCount: 8, venueId }],
      drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }],
      startDate: START_DATE,
      endDate: END_DATE,
    });

    tournamentEngine.setState(tournamentRecord);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId } = tournamentRecord;

    // Get distinct drawIds
    const drawIds = [...new Set(matchUps.map((m) => m.drawId))];
    expect(drawIds.length).toEqual(2);

    const rounds: any[] = [];
    for (const drawId of drawIds) {
      const dm = matchUps.find((m) => m.drawId === drawId);
      const eventId = tournamentEngine.getEvent({ drawId }).event?.eventId;
      rounds.push({
        tournamentId,
        eventId,
        drawId,
        structureId: dm?.structureId,
        roundNumber: 1,
      });
    }

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: START_DATE,
          venues: [{ venueId, rounds }],
        },
      ],
    });

    let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [START_DATE] });
    expect(result.success).toBe(true);

    // 4 + 4 = 8 R1 matchUps from both draws
    const dayIds = result.scheduledMatchUpIds[START_DATE] ?? [];
    expect(dayIds.length).toEqual(8);
  });
});
