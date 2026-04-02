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
