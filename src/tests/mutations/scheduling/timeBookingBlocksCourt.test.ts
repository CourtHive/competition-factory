import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

/**
 * A court closed for maintenance must not receive a matchUp scheduled inside the closure.
 *
 * `getGridBookings` splits a court's bookings in two: those carrying a numeric `courtOrder` (a cell
 * blocked by hand on the grid) and those carrying only `startTime`/`endTime` (a time window the
 * court is unavailable). `courtGridRows` turns the FIRST kind into `isBlocked` cells, which
 * `proAutoSchedule` already skips. The second kind was computed and discarded.
 *
 * That matters beyond demos: TMX's court-block UI writes the time-based kind, so a director could
 * block a court for maintenance, auto-schedule, and find matchUps on it.
 *
 * Time-based blocking is only meaningful for matchUps that carry a `scheduledTime` — a pure
 * order-based grid row has no clock time to overlap with. So the guard is scoped to exactly that:
 * a TIMED matchUp is not placed on a court whose time booking covers its time.
 */
const DATE = '2026-06-01';

function setup() {
  tournamentEngine.reset();
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'v1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawId: 'd1', drawSize: 32, seedsCount: 8 }],
    schedulingProfile: [
      { scheduleDate: DATE, venues: [{ venueId: 'v1', rounds: [{ drawId: 'd1', roundNumber: 1 }] }] },
    ],
    startDate: DATE,
    endDate: DATE,
    autoSchedule: true,
  });
  tournamentEngine.setState(tournamentRecord);
  return tournamentEngine.getVenuesAndCourts({ venueIds: ['v1'] }).courts ?? [];
}

const toMinutes = (value: string) => {
  const time = value.includes('T') ? value.split('T')[1] : value;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

describe('time-based court bookings', () => {
  it('does not place a timed matchUp on a court closed at that time', () => {
    const courts: any[] = setup();
    const closed = courts[2];

    tournamentEngine.modifyCourtAvailability({
      courtId: closed.courtId,
      dateAvailability: [
        { date: DATE, startTime: '08:00', endTime: '20:00', bookings: [{ startTime: '10:00', endTime: '12:00' }] },
      ],
    });

    tournamentEngine.scheduleProfileGrid({ scheduleDates: [DATE] });

    const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
    const courted = matchUps.filter((m: any) => m.schedule?.courtId && m.schedule?.scheduledTime);

    // Non-vacuity: the run must actually have placed matchUps, and some must fall in the window —
    // otherwise "none on the closed court" would be true for the wrong reason.
    expect(courted.length).toBeGreaterThan(4);
    const inWindow = courted.filter(
      (m: any) => toMinutes(m.schedule.scheduledTime) >= 600 && toMinutes(m.schedule.scheduledTime) < 720,
    );
    expect(inWindow.length).toBeGreaterThan(0);

    expect(inWindow.filter((m: any) => m.schedule.courtId === closed.courtId)).toEqual([]);
  });

  it('still uses the closed court outside the closure', () => {
    const courts: any[] = setup();
    const closed = courts[2];

    tournamentEngine.modifyCourtAvailability({
      courtId: closed.courtId,
      dateAvailability: [
        { date: DATE, startTime: '08:00', endTime: '20:00', bookings: [{ startTime: '10:00', endTime: '12:00' }] },
      ],
    });
    tournamentEngine.scheduleProfileGrid({ scheduleDates: [DATE] });

    const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
    const onClosed = matchUps.filter((m: any) => m.schedule?.courtId === closed.courtId);
    // A closure is not a decommission — the court must still take matchUps at other times.
    expect(onClosed.length).toBeGreaterThan(0);
  });

  it('leaves an unbooked venue unchanged', () => {
    setup();
    tournamentEngine.scheduleProfileGrid({ scheduleDates: [DATE] });
    const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
    expect(matchUps.filter((m: any) => m.schedule?.courtId).length).toBeGreaterThan(4);
  });

  // The scenario this came from: a NOW-anchored demo schedule (scenarioProfile) on a venue with one
  // court closed for maintenance. Before the fix this put a matchUp inside the closure at 2 of 8
  // sampled times of day — intermittently, which is how it survived.
  it('holds for an anchored schedule across the day', () => {
    const offenders: string[] = [];

    for (const hour of [8, 11, 14, 17, 20]) {
      tournamentEngine.reset();
      const anchor = `${DATE}T${String(hour).padStart(2, '0')}:00`;
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        tournamentAttributes: { tournamentId: `anchored-${hour}` },
        venueProfiles: [
          {
            venueId: 'v1',
            courtsCount: 6,
            startTime: '06:00',
            endTime: '23:00',
            courtTimings: [undefined, undefined, { bookings: [{ startTime: '13:00', endTime: '15:00' }] }],
          },
        ],
        drawProfiles: [{ drawId: 'd1', drawSize: 32, seedsCount: 8 }],
        schedulingProfile: [
          {
            scheduleDate: DATE,
            venues: [
              {
                venueId: 'v1',
                rounds: [
                  { drawId: 'd1', roundNumber: 1 },
                  { drawId: 'd1', roundNumber: 2 },
                ],
              },
            ],
          },
        ],
        scenarioProfile: { anchor, minutesBeforeAnchor: 150, assignCourts: true },
        startDate: DATE,
        endDate: DATE,
        autoSchedule: true,
      });
      tournamentEngine.setState(tournamentRecord);

      const courts: any[] = tournamentEngine.getVenuesAndCourts({ venueIds: ['v1'] }).courts ?? [];
      const closed = courts.find((c: any) => (c.dateAvailability ?? []).some((d: any) => d.bookings?.length));
      const matchUps: any[] = tournamentEngine.allTournamentMatchUps().matchUps ?? [];
      const courted = matchUps.filter((m: any) => m.schedule?.courtId && m.schedule?.scheduledTime);
      expect(courted.length).toBeGreaterThan(4); // non-vacuity, per anchor

      const inside = courted.filter(
        (m: any) =>
          m.schedule.courtId === closed?.courtId &&
          toMinutes(m.schedule.scheduledTime) >= 780 &&
          toMinutes(m.schedule.scheduledTime) < 900,
      );
      if (inside.length) offenders.push(`${hour}:00 -> ${inside.length}`);
    }

    expect(offenders).toEqual([]);
  });
});
