import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { CALL_TIMING_VARIANCE_REPORT } from '@Constants/reportConstants';

const SCHEDULED_DATE = '2026-01-15';

function seedTwoScheduledMatchUps() {
  mocksEngine.generateTournamentRecord({
    startDate: SCHEDULED_DATE,
    endDate: SCHEDULED_DATE,
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles: [{ courtsCount: 2 }],
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const playable = (matchUps ?? []).filter((m: any) => m.matchUpStatus !== 'BYE');
  return playable;
}

describe('call timing variance report', () => {
  it('computes signed variance between scheduledTime and calledAt (worst-late first)', () => {
    const [first, second] = seedTwoScheduledMatchUps();

    // First matchUp: called 25 minutes after its scheduled time (running late).
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '10:00' },
    });
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      calledAt: '2026-01-15T10:25:00.000Z',
    });

    // Second matchUp: called 5 minutes early.
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: second.matchUpId,
      drawId: second.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '11:00' },
    });
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: second.matchUpId,
      drawId: second.drawId,
      calledAt: '2026-01-15T10:55:00.000Z',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: 0 },
    });

    expect(result.reportId).toBe(CALL_TIMING_VARIANCE_REPORT);
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].varianceMinutes).toBe(25);
    expect(result.rows[1].varianceMinutes).toBe(-5);

    // Called At displays as a bare clock when it shares the scheduled date;
    // scheduledTime stays HH:mm and the full ISO is retained for export.
    expect(result.rows[0].calledAt).toBe('10:25');
    expect(result.rows[0].scheduledTime).toBe('10:00');
    expect(result.rows[0].calledAtIso).toBe('2026-01-15T10:25:00.000Z');

    expect(result.summary.matchUpsWithCallData).toBe(2);
    expect(result.summary.calledLateCount).toBe(1);
    expect(result.summary.calledLatePercentage).toBe(50);
    expect(result.summary.maxVarianceMinutes).toBe(25);
    expect(result.summary.minVarianceMinutes).toBe(-5);
    expect(result.summary.averageVarianceMinutes).toBe(10);
    expect(result.summary.medianVarianceMinutes).toBe(10);
  });

  it('applies utcOffsetMinutes so venue-local scheduledTime aligns with UTC calledAt', () => {
    const [first] = seedTwoScheduledMatchUps();

    // 14:00 US Eastern Standard Time (offset -300) === 19:00 UTC. Called at
    // 19:10 UTC ⇒ 10 minutes late in venue-local terms.
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '14:00' },
    });
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      calledAt: '2026-01-15T19:10:00.000Z',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: -300 },
    });

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].varianceMinutes).toBe(10);
    // 19:10 UTC shifted to US Eastern (offset -300) = 14:10 local, same date.
    expect(result.rows[0].calledAt).toBe('14:10');
    expect(result.summary.utcOffsetMinutes).toBe(-300);
  });

  it('prefixes the called date when it differs from the scheduled date', () => {
    const [first] = seedTwoScheduledMatchUps();

    // Called just after local midnight the next day (US Eastern offset -300):
    // 04:30 UTC on 2026-01-16 = 23:30 local on 2026-01-15 — same scheduled day.
    // 05:30 UTC = 00:30 local on 2026-01-16 — a genuine date rollover.
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '23:00' },
    });
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      calledAt: '2026-01-16T05:30:00.000Z',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: -300 },
    });

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].calledAt).toBe('2026-01-16 00:30');
  });

  it('excludes matchUps missing calledAt and counts them as scheduled-but-uncalled', () => {
    const [first, second] = seedTwoScheduledMatchUps();

    // Scheduled but never called to court.
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '09:00' },
    });
    // Scheduled and called.
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: second.matchUpId,
      drawId: second.drawId,
      schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '09:30' },
    });
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: second.matchUpId,
      drawId: second.drawId,
      calledAt: '2026-01-15T09:30:00.000Z',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: 0 },
    });

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].matchUp).toBeTruthy();
    expect(result.summary.scheduledButUncalled).toBe(1);
    expect(result.summary.matchUpsWithCallData).toBe(1);
  });

  it('excludes a called matchUp that has no scheduled time', () => {
    const [first] = seedTwoScheduledMatchUps();

    // calledAt stamped but never given a scheduledTime — variance is undefined,
    // so the row is skipped and it is not counted as scheduled-but-uncalled.
    tournamentEngine.setMatchUpCalledAt({
      matchUpId: first.matchUpId,
      drawId: first.drawId,
      calledAt: '2026-01-15T10:00:00.000Z',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: 0 },
    });

    expect(result.rows.length).toBe(0);
    expect(result.summary.scheduledButUncalled).toBe(0);
    expect(result.summary.matchUpsWithCallData).toBe(0);
  });

  it('returns a zeroed summary when no matchUps have been called', () => {
    seedTwoScheduledMatchUps();

    const result: any = tournamentEngine.generateReport({ reportId: CALL_TIMING_VARIANCE_REPORT });

    expect(result.rows).toEqual([]);
    expect(result.summary).toMatchObject({
      matchUpsWithCallData: 0,
      averageVarianceMinutes: 0,
      medianVarianceMinutes: 0,
      maxVarianceMinutes: 0,
      minVarianceMinutes: 0,
      calledLateCount: 0,
      calledLatePercentage: 0,
    });
  });

  it('reports the median with an odd number of called matchUps', () => {
    const playable = seedTwoScheduledMatchUps();
    const three = playable.slice(0, 3);
    // Variances of +5, +10, +20 ⇒ odd-length median is the middle value (10).
    const offsets = [
      { time: '10:00', calledAt: '2026-01-15T10:05:00.000Z' },
      { time: '11:00', calledAt: '2026-01-15T11:10:00.000Z' },
      { time: '12:00', calledAt: '2026-01-15T12:20:00.000Z' },
    ];
    three.forEach((m: any, i: number) => {
      tournamentEngine.addMatchUpScheduleItems({
        matchUpId: m.matchUpId,
        drawId: m.drawId,
        schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: offsets[i].time },
      });
      tournamentEngine.setMatchUpCalledAt({ matchUpId: m.matchUpId, drawId: m.drawId, calledAt: offsets[i].calledAt });
    });

    const result: any = tournamentEngine.generateReport({
      reportId: CALL_TIMING_VARIANCE_REPORT,
      parameters: { utcOffsetMinutes: 0 },
    });

    expect(result.rows.length).toBe(3);
    expect(result.summary.medianVarianceMinutes).toBe(10);
    expect(result.summary.maxVarianceMinutes).toBe(20);
  });

  it('is listed as computable whenever the tournament has venues', () => {
    seedTwoScheduledMatchUps();

    const withVenues: any = tournamentEngine.getAvailableReports();
    const variance = withVenues.availableReports.find((r: any) => r.reportId === CALL_TIMING_VARIANCE_REPORT);
    expect(variance).toBeTruthy();
    expect(variance.computableNow).toBe(true);
  });

  it('is not computable when the tournament has no venues', () => {
    mocksEngine.generateTournamentRecord({
      startDate: SCHEDULED_DATE,
      endDate: SCHEDULED_DATE,
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const result: any = tournamentEngine.getAvailableReports();
    const variance = result.availableReports.find((r: any) => r.reportId === CALL_TIMING_VARIANCE_REPORT);
    expect(variance.computableNow).toBe(false);
  });
});
