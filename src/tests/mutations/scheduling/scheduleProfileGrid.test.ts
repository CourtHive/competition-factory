import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { NO_VALID_DATES } from '@Constants/errorConditionConstants';

const startDate = '2024-06-15';
const endDate = '2024-06-20';

describe('scheduleProfileGrid', () => {
  it('places matchUps on the court grid using the scheduling profile', () => {
    const venueId = 'venue-1';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'Club Courts', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawSize: 16 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    // Set up a profile: R1 on day 1, R2 on day 2
    const schedulingProfile = [
      {
        scheduleDate: startDate,
        venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
      },
      {
        scheduleDate: '2024-06-16',
        venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 2 }] }],
      },
    ];

    result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
    expect(result.success).toEqual(true);

    // Apply grid scheduling
    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate, '2024-06-16'] });
    expect(result.success).toEqual(true);
    expect(result.scheduledDates.length).toEqual(2);

    // R1 has 8 matchUps (drawSize 16), should all be scheduled on day 1
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toEqual(8);

    // R2 has 4 matchUps, should all be scheduled on day 2
    const day2Ids = result.scheduledMatchUpIds['2024-06-16'] ?? [];
    expect(day2Ids.length).toEqual(4);

    // Verify matchUps have courtOrder but no scheduledTime
    const { matchUps: allAfter } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const scheduledOnDay1 = allAfter.filter((m) => m.schedule?.scheduledDate === startDate && m.schedule?.courtOrder);
    expect(scheduledOnDay1.length).toEqual(8);
    expect(scheduledOnDay1.every((m) => !m.schedule?.scheduledTime)).toEqual(true);
    expect(scheduledOnDay1.every((m) => !!m.schedule?.courtId)).toEqual(true);
  });

  it('returns NO_VALID_DATES when profile has no matching dates', () => {
    const venueId = 'venue-no-dates';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'V', venueAbbreviation: 'V', courtsCount: 2, venueId }],
      drawProfiles: [{ drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    result = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });
    expect(result.success).toEqual(true);

    // Request a date not in the profile
    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: ['2099-01-01'] });
    expect(result.error).toEqual(NO_VALID_DATES);
  });

  it('returns success with no scheduling when profile is empty', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'V', venueAbbreviation: 'V', courtsCount: 2 }],
      drawProfiles: [{ drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    result = tournamentEngine.setSchedulingProfile({ schedulingProfile: [] });
    expect(result.success).toEqual(true);

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);
  });

  it('skips matchUps already assigned to courts', () => {
    const venueId = 'venue-1';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true, nextMatchUps: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    // Pre-schedule one matchUp via proAutoSchedule
    const r1MatchUps = matchUps.filter((m) => m.roundNumber === 1);
    result = tournamentEngine.proAutoSchedule({
      matchUps: [r1MatchUps[0]],
      scheduledDate: startDate,
    });
    expect(result.scheduled.length).toEqual(1);

    // Now set profile and apply grid
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    // Should only schedule the 3 remaining R1 matchUps (1 was pre-scheduled)
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toEqual(3);
  });

  // Regression: completed matchUps from a prior session were consuming court
  // grid slots before being discarded at persist time, pushing newly-scheduled
  // matchUps several rows down. Originally surfaced as a 32-draw SE whose
  // 16 completed R1 matchUps reserved rows 1-3 + part of row 4 in the grid,
  // so Round 2 of the same draw and an unrelated event's Round 1 both started
  // at courtOrder 4 instead of 1.
  it('does not reserve grid slots for completed matchUps in earlier rounds', () => {
    const venueId = 'venue-completed-r1';
    const drawId = 'draw-with-completed-r1';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [
        {
          drawId,
          drawSize: 16,
          // Complete every Round 1 matchUp so R1 contributes 0 placeable matchUps.
          outcomes: [
            { roundNumber: 1, roundPosition: 1, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 3, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 5, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 6, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 7, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 8, scoreString: '6-0 6-0', winningSide: 1 },
          ],
        },
      ],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const r1 = matchUps.filter((m) => m.roundNumber === 1);
    const r2 = matchUps.filter((m) => m.roundNumber === 2);
    expect(r1.every((m) => m.matchUpStatus === 'COMPLETED')).toEqual(true);
    expect(r2.length).toEqual(4);
    const { tournamentId, eventId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId,
              rounds: [
                { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
                { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
              ],
            },
          ],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    // Only the 4 R2 matchUps should be scheduled; the 8 completed R1 matchUps
    // must not be present in scheduledMatchUpIds.
    const scheduledIds = result.scheduledMatchUpIds[startDate] ?? [];
    expect(scheduledIds.length).toEqual(4);
    const r1Ids = new Set(r1.map((m) => m.matchUpId));
    expect(scheduledIds.some((id) => r1Ids.has(id))).toEqual(false);

    // Critical regression assertion: R2 matchUps must land at courtOrder 1,
    // not be pushed down by the (filtered-out) completed R1 matchUps.
    const { matchUps: allAfter } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const scheduledR2 = allAfter.filter((m) => m.roundNumber === 2 && m.schedule?.courtOrder);
    expect(scheduledR2.length).toEqual(4);
    const courtOrders = scheduledR2.map((m) => m.schedule.courtOrder).sort((a, b) => a - b);
    // 4 R2 matchUps on 4 courts → each takes courtOrder 1, not courtOrder >1.
    expect(courtOrders[0]).toEqual(1);
    expect(Math.max(...courtOrders)).toBeLessThanOrEqual(1);
  });

  it('respects scheduleCompletedMatchUps override (legacy mocksEngine behavior)', () => {
    const venueId = 'venue-include-completed';
    const drawId = 'draw-include-completed';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [
        {
          drawId,
          drawSize: 8,
          outcomes: [
            { roundNumber: 1, roundPosition: 1, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 2, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 3, scoreString: '6-0 6-0', winningSide: 1 },
            { roundNumber: 1, roundPosition: 4, scoreString: '6-0 6-0', winningSide: 1 },
          ],
        },
      ],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId,
              rounds: [
                { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
                { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
              ],
            },
          ],
        },
      ],
    });

    // With override, completed matchUps re-enter the pipeline (the legacy
    // path used by mocksEngine seeding). We don't assert on exact placement
    // here — only that the override is respected so the count is higher.
    result = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      scheduleCompletedMatchUps: true,
    });
    expect(result.success).toEqual(true);
    const scheduledIds = result.scheduledMatchUpIds[startDate] ?? [];
    // Default-path baseline would only schedule R2 (2 matchUps); with override
    // the 4 completed R1 also enter the pipeline.
    expect(scheduledIds.length).toBeGreaterThan(2);
  });

  // Regression: when Garman has already assigned scheduledTime to matchUps
  // (Garman → Pro workflow), the pro scheduler used to place them by
  // roundPosition only, so a 09:30 matchUp could end up on a row below a
  // later-time matchUp from the same round. Now matchUps are pre-sorted
  // by (scheduledDate, scheduledTime) so earlier times prefer earlier rows.
  // Single-court fixture makes the (time → courtOrder) mapping 1:1.
  it('respects existing scheduledTime when ordering matchUps onto the grid', () => {
    const venueId = 'venue-time-aware';
    const drawId = 'draw-time-aware';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 1, venueId }],
      drawProfiles: [{ drawId, drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const r1 = matchUps.filter((m) => m.roundNumber === 1).sort((a, b) => a.roundPosition - b.roundPosition);
    expect(r1.length).toEqual(4);

    // Pre-set scheduledDate + scheduledTime in REVERSE order of roundPosition.
    // The earliest time (08:00) is assigned to roundPosition 4 — under the
    // old behavior this matchUp landed on the last row; with the chronological
    // sort it must land on courtOrder 1.
    const timeAssignments = [
      { matchUpId: r1[0].matchUpId, scheduledTime: '11:00' }, // roundPosition 1
      { matchUpId: r1[1].matchUpId, scheduledTime: '10:00' }, // roundPosition 2
      { matchUpId: r1[2].matchUpId, scheduledTime: '09:00' }, // roundPosition 3
      { matchUpId: r1[3].matchUpId, scheduledTime: '08:00' }, // roundPosition 4
    ];

    for (const { matchUpId, scheduledTime } of timeAssignments) {
      result = tournamentEngine.addMatchUpScheduleItems({
        matchUpId,
        drawId,
        schedule: { scheduledDate: startDate, scheduledTime },
      });
      expect(result.success).toEqual(true);
    }

    const { tournamentId, eventId, structureId } = matchUps[0];
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    const { matchUps: after } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const placed = after
      .filter((m) => m.roundNumber === 1 && m.schedule?.courtOrder)
      .map((m) => ({ time: m.schedule.scheduledTime, courtOrder: m.schedule.courtOrder }));
    expect(placed.length).toEqual(4);

    // 1 court → 1 mu per row → strict chronological mapping.
    const byCourtOrder = [...placed].sort((a, b) => a.courtOrder - b.courtOrder);
    expect(byCourtOrder.map((p) => p.time)).toEqual(['08:00', '09:00', '10:00', '11:00']);
    expect(byCourtOrder.map((p) => p.courtOrder)).toEqual([1, 2, 3, 4]);
  });

  it('does not enforce daily limits when matchUpDailyLimits is omitted (default behavior)', () => {
    const venueId = 'venue-no-limits';
    const drawId = 'draw-no-limits';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawId, drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId,
              rounds: [
                { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
                { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
              ],
            },
          ],
        },
      ],
    });

    // No matchUpDailyLimits passed — all 4 R1 + 2 R2 should land.
    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);
    expect((result.scheduledMatchUpIds[startDate] ?? []).length).toEqual(6);
    expect(result.overLimitMatchUpIds[startDate]).toBeUndefined();
  });

  it('shunts matchUps that exceed matchUpDailyLimits.SINGLES to overLimitMatchUpIds', () => {
    const venueId = 'venue-with-limit';
    const drawId = 'draw-with-limit';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueName: 'CC', venueAbbreviation: 'CC', courtsCount: 4, venueId }],
      drawProfiles: [{ drawId, drawSize: 8 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            {
              venueId,
              rounds: [
                { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
                { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
                { tournamentId, eventId, drawId, structureId, roundNumber: 3 },
              ],
            },
          ],
        },
      ],
    });

    // SINGLES limit of 1 per participant per day. R1 has 4 matchUps with 8
    // unique participants — each plays exactly 1 match in R1, hitting the
    // limit. R2 (and R3) potentialParticipants are R1 winners, all at limit
    // → R2 + R3 matchUps must end up in overLimitMatchUpIds.
    result = tournamentEngine.scheduleProfileGrid({
      scheduleDates: [startDate],
      matchUpDailyLimits: { SINGLES: 1, total: 1 },
    });
    expect(result.success).toEqual(true);

    const scheduledIds: string[] = result.scheduledMatchUpIds[startDate] ?? [];
    const overLimitIds: string[] = result.overLimitMatchUpIds[startDate] ?? [];
    expect(scheduledIds.length).toEqual(4); // only R1 matchUps placed
    // R2 has 2 matchUps + R3 has 1 matchUp → 3 over-limit total.
    expect(overLimitIds.length).toEqual(3);

    // Sanity: no overlap between scheduled and over-limit.
    for (const id of scheduledIds) expect(overLimitIds).not.toContain(id);
  });

  it('handles multiple venues in a single date', () => {
    const venueId1 = 'venue-a';
    const venueId2 = 'venue-b';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [
        { venueName: 'Venue A', venueAbbreviation: 'VA', courtsCount: 2, venueId: venueId1 },
        { venueName: 'Venue B', venueAbbreviation: 'VB', courtsCount: 2, venueId: venueId2 },
      ],
      drawProfiles: [{ drawSize: 16 }],
      startDate,
      endDate,
    });

    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allCompetitionMatchUps({ inContext: true });
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];

    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: startDate,
          venues: [
            { venueId: venueId1, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] },
            { venueId: venueId2, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 2 }] },
          ],
        },
      ],
    });

    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);

    // R1 (8 matchUps) and R2 (4 matchUps) — all on venue A + B courts
    const day1Ids = result.scheduledMatchUpIds[startDate] ?? [];
    expect(day1Ids.length).toBeGreaterThanOrEqual(8); // at least R1 should be fully scheduled
  });
});
