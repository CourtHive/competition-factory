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

function generate(scenarioProfile?: any) {
  return mocksEngine.generateTournamentRecord({
    startDate: today,
    endDate: today,
    drawProfiles: [{ drawId: DRAW, drawSize: 16, drawType: 'SINGLE_ELIMINATION' }],
    venueProfiles: [{ venueId: VENUE, courtsCount: 6, startTime: '08:00', endTime: '20:00' }],
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
    const anchor = '2026-09-23T15:00';
    const result = generate({ anchor, minutesBeforeAnchor: 120, assignCourts: true });
    tournamentEngine.setState(result.tournamentRecord);

    const earliest = instants()[0];
    expect(earliest).toEqual(new Date('2026-09-23T13:00').getTime());
    expect(result.scenarioResult?.shiftedCount).toBeGreaterThan(0);
  });

  it('preserves the spacing the scheduler derived — it shifts, it does not re-derive', () => {
    const before = generate();
    tournamentEngine.setState(before.tournamentRecord);
    const gapsBefore = instants().map((t, i, a) => (i ? t - a[i - 1] : 0));

    const after = generate({ anchor: '2026-09-23T15:00', minutesBeforeAnchor: 90 });
    tournamentEngine.setState(after.tournamentRecord);
    const gapsAfter = instants().map((t, i, a) => (i ? t - a[i - 1] : 0));

    expect(gapsAfter).toEqual(gapsBefore);
  });

  it('puts matchUps on BOTH sides of the anchor, which is what makes a now-strip demonstrable', () => {
    const anchor = '2026-09-23T15:00';
    tournamentEngine.setState(generate({ anchor, minutesBeforeAnchor: 120 }).tournamentRecord);
    const anchorMs = new Date(anchor).getTime();
    const times = instants();
    expect(times.filter((t) => t < anchorMs).length).toBeGreaterThan(0);
    expect(times.filter((t) => t > anchorMs).length).toBeGreaterThan(0);
  });

  it("anchor 'NOW' lands the schedule around the current clock", () => {
    const now = Date.now();
    tournamentEngine.setState(generate({ anchor: 'NOW', minutesBeforeAnchor: 60 }).tournamentRecord);
    const earliest = instants()[0];
    // within a minute of (now - 60m); isoMinute truncates seconds
    expect(Math.abs(earliest - (now - 60 * 60_000))).toBeLessThan(90_000);
  });

  it('assignCourts puts matchUps on courts while keeping their times', () => {
    const result = generate({ anchor: '2026-09-23T15:00', minutesBeforeAnchor: 120, assignCourts: true });
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
      scenarioProfile: { anchor: '2026-09-23T15:00' },
    });
    expect(result.error).toBeUndefined();
    expect(result.scenarioResult?.shiftedCount).toEqual(0);
  });
});
