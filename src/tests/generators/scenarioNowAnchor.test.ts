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
const today = new Date().toISOString().split('T')[0];

// The anchor must be DERIVED from `today`, never written as a literal. These tests generate the
// tournament for the current date, so a fixed calendar date only agreed with it on the day it was
// written — after which the shift lands the schedule a whole day from where the assertions look,
// and `dev` goes red for reasons that have nothing to do with anchoring.
const ANCHOR = `${today}T15:00`;

function generate(
  scenarioProfile?: any,
  venueHours: { startTime: string; endTime: string } = { startTime: '08:00', endTime: '20:00' },
  startDate: string = today,
  endDate: string = today,
) {
  return mocksEngine.generateTournamentRecord({
    startDate,
    endDate,
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
    const anchor = ANCHOR;
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

    const after = generate({ anchor: ANCHOR, minutesBeforeAnchor: 90 });
    tournamentEngine.setState(after.tournamentRecord);
    const gapsAfter = instants().map((t, i, a) => (i ? t - a[i - 1] : 0));

    expect(gapsAfter).toEqual(gapsBefore);
  });

  it('puts matchUps on BOTH sides of the anchor, which is what makes a now-strip demonstrable', () => {
    const anchor = ANCHOR;
    tournamentEngine.setState(generate({ anchor, minutesBeforeAnchor: 120 }).tournamentRecord);
    const anchorMs = new Date(anchor).getTime();
    const times = instants();
    expect(times.filter((t) => t < anchorMs).length).toBeGreaterThan(0);
    expect(times.filter((t) => t > anchorMs).length).toBeGreaterThan(0);
  });

  /**
   * UN-SKIPPED. The defect this was parked against is fixed in `applyScenarioProfile`.
   *
   * It was `it.skip` because `addMatchUpScheduledTime` keeps the date part of an ISO value only
   * when the matchUp has none (`scheduledTime.ts:54`, `const keepDate = timeDate && !scheduledDate`)
   * and an auto-scheduled matchUp always has one — so any shift crossing a day boundary left the
   * record's date and time disagreeing by exactly 24 hours. That is what turned `dev` red at
   * 2026-09-24T00:22Z having been green at 12:18Z the same day.
   *
   * `applyScenarioProfile` now writes the DATE alongside the time, and REFUSES the whole profile —
   * before writing any of it — when the shift would leave the tournament's range, rather than
   * clamping or widening the tournament behind the caller's back.
   *
   * So this test now has to give the tournament room for the instant it names: before 01:00 the
   * target is YESTERDAY, and a tournament spanning only today would (correctly) refuse.
   */
  it("anchor 'NOW' lands the schedule around the current clock", () => {
    const now = Date.now();
    const target = new Date(now - 60 * 60_000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const rangeStart = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;

    // The range must cover the WHOLE shifted schedule, not just its first matchUp: sixteen matchUps
    // anchored an hour ago run forward, and late in the evening the tail crosses midnight. Measured
    // in Pacific/Auckland at 22:29 local, where the un-widened version is (correctly) refused.
    const tail = new Date(now + 24 * 60 * 60_000);
    const rangeEnd = `${tail.getFullYear()}-${pad(tail.getMonth() + 1)}-${pad(tail.getDate())}`;
    const generated = generate(
      { anchor: 'NOW', minutesBeforeAnchor: 60 },
      { startTime: '00:00', endTime: '23:59' },
      rangeStart,
      rangeEnd,
    );
    expect(generated.error).toBeUndefined();
    tournamentEngine.setState(generated.tournamentRecord);

    const earliest = instants()[0];
    // within a minute of (now - 60m); isoMinute truncates seconds
    expect(Math.abs(earliest - (now - 60 * 60_000))).toBeLessThan(90_000);
  });

  it('assignCourts puts matchUps on courts while keeping their times', () => {
    const result = generate({ anchor: ANCHOR, minutesBeforeAnchor: 120, assignCourts: true });
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
      scenarioProfile: { anchor: ANCHOR },
    });
    expect(result.error).toBeUndefined();
    expect(result.scenarioResult?.shiftedCount).toEqual(0);
  });
});
