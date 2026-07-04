import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';

// Constants and Types
import { CALL_TIMING_VARIANCE_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

type WrapArgs = {
  tournamentRecord: Tournament;
  parameters?: { utcOffsetMinutes?: number };
};

const MS_PER_MINUTE = 60_000;

/**
 * Combine a calendar date ("YYYY-MM-DD") and wall-clock time ("HH:mm") into a
 * UTC instant, given the venue's offset from UTC in minutes (local = UTC +
 * offset; e.g. US Eastern Standard Time = -300). Returns null when either part
 * is missing or malformed.
 */
function plannedInstant(scheduledDate?: string, scheduledTime?: string, utcOffsetMinutes = 0): number | null {
  if (!scheduledDate || !scheduledTime) return null;
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(scheduledTime);
  if (!timeMatch) return null;
  const base = Date.parse(`${scheduledDate}T00:00:00.000Z`);
  if (Number.isNaN(base)) return null;
  const wallClockMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  // Local wall-clock = UTC + offset ⇒ UTC = wall-clock − offset.
  return base + (wallClockMinutes - utcOffsetMinutes) * MS_PER_MINUTE;
}

/**
 * Break a UTC ISO timestamp into venue-local calendar date + wall clock,
 * shifting by the venue's offset from UTC (local = UTC + offset).
 */
function localClockParts(iso: string, utcOffsetMinutes: number): { date: string; time: string } | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(ms + utcOffsetMinutes * MS_PER_MINUTE);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const min = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
}

// Display the called time as a bare clock (HH:mm) when it falls on the same
// calendar day as the scheduled date; prefix the date only when they differ.
function calledDisplay(parts: { date: string; time: string } | null, scheduledDate?: string, fallback = ''): string {
  if (!parts) return fallback;
  return parts.date === scheduledDate ? parts.time : `${parts.date} ${parts.time}`;
}

function participantsLabel(matchUp: any): string {
  const side1 = matchUp?.sides?.[0]?.participant?.participantName;
  const side2 = matchUp?.sides?.[1]?.participant?.participantName;
  if (side1 && side2) return `${side1} vs ${side2}`;
  return side1 || side2 || matchUp?.matchUpId || '';
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function buildRow(
  matchUp: any,
  planned: number,
  utcOffsetMinutes: number,
  eventNameMap: Record<string, string>,
  drawNameMap: Record<string, string>,
) {
  const schedule = matchUp.schedule ?? {};
  const varianceMinutes = Math.round((Date.parse(schedule.calledAt) - planned) / MS_PER_MINUTE);
  const parts = localClockParts(schedule.calledAt, utcOffsetMinutes);
  return {
    eventId: matchUp.eventId,
    eventName: eventNameMap[matchUp.eventId] || matchUp.eventId || '',
    drawName: drawNameMap[matchUp.drawId] || matchUp.drawId || '',
    roundName: matchUp.roundName ?? (matchUp.roundNumber ? `R${matchUp.roundNumber}` : ''),
    matchUp: participantsLabel(matchUp),
    venueName: schedule.venueName ?? '',
    courtName: schedule.courtName ?? '',
    scheduledDate: schedule.scheduledDate ?? '',
    scheduledTime: schedule.scheduledTime ?? '',
    // Display clock; full UTC ISO retained in calledAtIso for lossless export.
    calledAt: calledDisplay(parts, schedule.scheduledDate, schedule.calledAt),
    calledAtIso: schedule.calledAt,
    varianceMinutes,
  };
}

/**
 * Call Timing Variance — for every matchUp that carries both a planned
 * `scheduledTime` and an actual `calledAt` (the moment it was called to court
 * via the schedule "Now" strip), report the signed variance in minutes.
 * Positive = called LATE (running behind); negative = called early.
 *
 * Rows are sorted worst-late first so the matches that ran furthest behind
 * surface at the top. The summary rolls up average/median/max variance,
 * how many matches were called late, and how many scheduled matchUps were
 * never called at all — quantifying how far behind an event is running.
 *
 * `parameters.utcOffsetMinutes` is the venue's offset from UTC (local = UTC +
 * offset). Supply it for accurate absolute variance when the operator's clock
 * is not UTC; omit it (default 0) to treat `scheduledTime` and `calledAt` in
 * the same frame — relative ordering of variances is unaffected by the offset.
 */
export function wrapCallTimingVarianceReport({
  tournamentRecord,
  parameters,
}: WrapArgs): ReportResult | { error: any } {
  const { matchUps } = allTournamentMatchUps({ tournamentRecord });
  if (!matchUps) return { error: 'No matchUps found' };

  const utcOffsetMinutes = parameters?.utcOffsetMinutes ?? 0;

  const eventNameMap: Record<string, string> = {};
  const drawNameMap: Record<string, string> = {};
  for (const event of tournamentRecord.events ?? []) {
    eventNameMap[event.eventId] = event.eventName ?? '';
    for (const draw of event.drawDefinitions ?? []) {
      drawNameMap[draw.drawId] = draw.drawName ?? '';
    }
  }

  // Every column sizes to its content except `matchUp`, which stays flexible so
  // it absorbs the spare table width (it holds the longest strings).
  const columns = [
    { key: 'eventName', title: 'Event', type: 'string' as const, fitData: true },
    { key: 'drawName', title: 'Draw', type: 'string' as const, fitData: true },
    { key: 'roundName', title: 'Round', type: 'string' as const, fitData: true },
    { key: 'matchUp', title: 'MatchUp', type: 'string' as const },
    { key: 'venueName', title: 'Venue', type: 'string' as const, fitData: true },
    { key: 'courtName', title: 'Court', type: 'string' as const, fitData: true },
    { key: 'scheduledDate', title: 'Date', type: 'date' as const, fitData: true, width: 110 },
    { key: 'scheduledTime', title: 'Scheduled', type: 'string' as const, fitData: true },
    { key: 'calledAt', title: 'Called At', type: 'string' as const, fitData: true },
    { key: 'varianceMinutes', title: 'Variance (min)', type: 'number' as const, width: 90, headerWordWrap: true },
  ];

  const rows: Record<string, any>[] = [];
  let scheduledButUncalled = 0;
  for (const matchUp of matchUps as any[]) {
    const schedule = matchUp.schedule ?? {};
    if (schedule.scheduledTime && !schedule.calledAt) scheduledButUncalled += 1;
    if (!schedule.calledAt || Number.isNaN(Date.parse(schedule.calledAt))) continue;
    const planned = plannedInstant(schedule.scheduledDate, schedule.scheduledTime, utcOffsetMinutes);
    if (planned === null) continue;
    rows.push(buildRow(matchUp, planned, utcOffsetMinutes, eventNameMap, drawNameMap));
  }

  // Worst-late first — furthest-behind matches rise to the top.
  rows.sort((a, b) => b.varianceMinutes - a.varianceMinutes);

  const variances = rows.map((r) => r.varianceMinutes);
  const lateCount = variances.filter((v) => v > 0).length;
  const totalVariance = variances.reduce((sum, v) => sum + v, 0);

  const summary = {
    matchUpsWithCallData: rows.length,
    scheduledButUncalled,
    averageVarianceMinutes: rows.length ? Math.round(totalVariance / rows.length) : 0,
    medianVarianceMinutes: median(variances),
    maxVarianceMinutes: variances.length ? Math.max(...variances) : 0,
    minVarianceMinutes: variances.length ? Math.min(...variances) : 0,
    calledLateCount: lateCount,
    calledLatePercentage: rows.length ? Math.round((lateCount / rows.length) * 100) : 0,
    utcOffsetMinutes,
  };

  return {
    reportId: CALL_TIMING_VARIANCE_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary,
  };
}
