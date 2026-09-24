import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

/**
 * An example is only demonstrable if its clock means something at the moment it is opened.
 *
 * Without anchoring, `mocksEngine` places matchUps from the venue's opening time, so a tournament
 * generated at 16:00 has every matchUp hours in the past and every wall-clock surface is dead.
 */

const DRAW = 'anchor-draw';
const VENUE = 'anchor-venue';
/**
 * LOCAL date, deliberately — not `toISOString()`, which is UTC.
 *
 * `instants()` rebuilds each matchUp's moment with `new Date(y, mo-1, d, h, mi)`, which is LOCAL,
 * and the `NOW` test compares that against `Date.now()`. Deriving the date in UTC while reading it
 * back in local time puts the two a day apart every evening west of UTC.
 */
const today = (() => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

function generate(
  scenarioProfile?: any,
  venueHours: { startTime: string; endTime: string } = { startTime: '08:00', endTime: '20:00' },
) {
  return mocksEngine.generateTournamentRecord({
    startDate: today,
    endDate: today,
    drawProfiles: [{ drawId: DRAW, drawSize: 16, drawType: 'SINGLE_ELIMINATION' }],
    venueProfiles: [{ venueId: VENUE, courtsCount: 6, ...venueHours }],
    schedulingProfile: [
      {
        scheduleDate: today,
        venues: [
          {
            venueId: VENUE,
            rounds: [
              { drawId: DRAW, roundNumber: 1 },
              { drawId: DRAW, roundNumber: 2 },
            ],
          },
        ],
      },
    ],
    autoSchedule: true,
    scenarioProfile,
  });
}

function instants() {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  return matchUps
    .filter((m: any) => m.schedule?.scheduledTime)
    .map((m: any) => {
      const t = m.schedule.scheduledTime.includes('T')
        ? m.schedule.scheduledTime.split('T')[1]
        : m.schedule.scheduledTime;
      const [h, mi] = t.split(':').map(Number);
      const [y, mo, d] = String(m.schedule.scheduledDate).split('T')[0].split('-').map(Number);
      return new Date(y, mo - 1, d, h, mi).getTime();
    })
    .sort((a, b) => a - b);
}

describe('scenarioProfile anchoring', () => {
  it('without it, the schedule stays pinned to the venue opening time', () => {
    tournamentEngine.setState(generate().tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const times = matchUps.filter((m: any) => m.schedule?.scheduledTime).map((m: any) => m.schedule.scheduledTime);
    expect(times.length).toBeGreaterThan(0);
    expect(times.some((t: string) => t.includes('08:00'))).toEqual(true);
  });

  it('places the first matchUp the requested distance before the anchor', () => {
    const anchor = `${today}T15:00`;
    const result = generate({ anchor, minutesBeforeAnchor: 120, assignCourts: true });
    tournamentEngine.setState(result.tournamentRecord);

    const earliest = instants()[0];
    expect(earliest).toEqual(new Date(`${today}T13:00`).getTime());
    expect(result.scenarioResult?.shiftedCount).toBeGreaterThan(0);
  });

  it('preserves the spacing the scheduler derived — it shifts, it does not re-derive', () => {
    const before = generate();
    tournamentEngine.setState(before.tournamentRecord);
    const gapsBefore = instants().map((t, i, a) => (i ? t - a[i - 1] : 0));

    const after = generate({ anchor: `${today}T15:00`, minutesBeforeAnchor: 90 });
    tournamentEngine.setState(after.tournamentRecord);
    const gapsAfter = instants().map((t, i, a) => (i ? t - a[i - 1] : 0));

    expect(gapsAfter).toEqual(gapsBefore);
  });

  it('puts matchUps on BOTH sides of the anchor, which is what makes a now-strip demonstrable', () => {
    const anchor = `${today}T15:00`;
    tournamentEngine.setState(generate({ anchor, minutesBeforeAnchor: 120 }).tournamentRecord);
    const anchorMs = new Date(anchor).getTime();
    const times = instants();
    expect(times.filter((t) => t < anchorMs).length).toBeGreaterThan(0);
    expect(times.filter((t) => t > anchorMs).length).toBeGreaterThan(0);
  });

  it("anchor 'NOW' lands the schedule around the current clock", () => {
    const now = new Date();
    /**
     * The offset must not cross midnight, and the venue must be open for it.
     *
     * `NOW` resolves to the current time of day ON THE SCHEDULED DATE, and this assertion compares
     * an ABSOLUTE instant — so the two only agree while the target stays inside today. Both ways it
     * could fail were measured against this checkpoint's CI, which ran at 00:51 UTC:
     *  - a venue opening at 08:00 cannot host a matchUp an hour earlier -> `3573841 < 90000`;
     *  - a fixed 60-minute offset lands on YESTERDAY before 01:00 -> `3582486 < 90000`, the
     *    scheduler clamping to the start of the day.
     * Capping the offset at minutes-since-midnight keeps the target on today's clock at any hour,
     * which is what the test is actually about.
     */
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const minutesBeforeAnchor = Math.min(60, minutesSinceMidnight);
    if (!minutesBeforeAnchor) return; // exactly midnight: nothing to assert, and vanishingly rare

    const generated = generate({ anchor: 'NOW', minutesBeforeAnchor }, { startTime: '00:00', endTime: '23:59' });
    tournamentEngine.setState(generated.tournamentRecord);
    const earliest = instants()[0];
    // within a minute of (now - offset); isoMinute truncates seconds
    expect(Math.abs(earliest - (now.getTime() - minutesBeforeAnchor * 60_000))).toBeLessThan(90_000);
  });

  it('assignCourts puts matchUps on courts while keeping their times', () => {
    const result = generate({ anchor: `${today}T15:00`, minutesBeforeAnchor: 120, assignCourts: true });
    tournamentEngine.setState(result.tournamentRecord);
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const withBoth = matchUps.filter((m: any) => m.schedule?.courtId && m.schedule?.scheduledTime);
    expect(withBoth.length).toBeGreaterThan(0);
  });

  it('rejects an unparseable anchor rather than silently scheduling at noon', () => {
    expect(generate({ anchor: 'not-a-datetime' }).error).not.toBeUndefined();
    expect(generate({ minutesBeforeAnchor: 'soon' }).error).not.toBeUndefined();
  });

  it('is a no-op, not an error, when nothing was scheduled', () => {
    const result = mocksEngine.generateTournamentRecord({
      startDate: today,
      drawProfiles: [{ drawSize: 8 }],
      scenarioProfile: { anchor: `${today}T15:00` },
    });
    expect(result.error).toBeUndefined();
    expect(result.scenarioResult?.shiftedCount).toEqual(0);
  });
});
