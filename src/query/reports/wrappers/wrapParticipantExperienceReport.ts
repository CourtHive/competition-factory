import { buildRecoveryTimeline, MS_PER_MINUTE, TimelineAppearance } from '../recoveryTimeline';

// Constants and Types
import { PARTICIPANT_EXPERIENCE_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

type WrapArgs = {
  tournamentRecord: Tournament;
  parameters?: { utcOffsetMinutes?: number; timeZone?: string; policyDefinitions?: any; asOfMs?: number };
};

const minutesBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / MS_PER_MINUTE);

function requiredAfter(previous: TimelineAppearance, next: TimelineAppearance): number {
  const typeChanged = !!previous.matchUpType && !!next.matchUpType && previous.matchUpType !== next.matchUpType;
  if (typeChanged && previous.typeChangeRecoveryMinutes) return previous.typeChangeRecoveryMinutes;
  return previous.recoveryMinutes;
}

type Accumulator = {
  worstOvernightReceived?: number;
  shortOvernightCount: number;
  worstRecoveryDeficit: number;
  shortRecoveryCount: number;
  longestDayMinutes: number;
  busiestDayMatches: number;
  estimatedRows: number;
  maxWaitMinutes?: number;
  courtMinutes: number;
  waitTotal: number;
  waitCount: number;
  matches: number;
  days: Set<string>;
};

/** Per-day spans, used for "at the site nine hours, played three". */
function accumulateDays(appearances: TimelineAppearance[], acc: Accumulator): void {
  const byDate = new Map<string, TimelineAppearance[]>();
  for (const appearance of appearances) {
    const existing = byDate.get(appearance.scheduledDate);
    if (existing) existing.push(appearance);
    else byDate.set(appearance.scheduledDate, [appearance]);
  }

  for (const dayAppearances of byDate.values()) {
    if (dayAppearances.length > acc.busiestDayMatches) acc.busiestDayMatches = dayAppearances.length;

    // The day starts when the participant was first *expected* — being told to
    // arrive at 09:00 and first playing at 14:00 is five hours of the experience
    // that a first-start anchor would erase.
    const firstExpectedMs = Math.min(...dayAppearances.map((a) => a.scheduledMs ?? a.startMs));
    const lastFinishMs = Math.max(...dayAppearances.map((a) => a.finishMs));
    const dayMinutes = minutesBetween(firstExpectedMs, lastFinishMs);
    if (dayMinutes > acc.longestDayMinutes) acc.longestDayMinutes = dayMinutes;
  }
}

/**
 * Participant Experience — one row per individual participant, rolled up across
 * the whole tournament, over the same timeline the per-appearance recovery report
 * uses so the two can never disagree.
 *
 * **Deliberately not a composite score.** A weighted "experience index" would
 * invent an authority the data does not have and would launder estimated
 * durations into a single confident number. These are sortable counts; the
 * operator decides what "worst" means. If a band is ever wanted, derive it from
 * `worstRecoveryDeficit` alone — the one quantity with a rulebook behind it.
 *
 * `meanWait` and `maxWait` rather than a standard deviation: a participant
 * consistently called 15 minutes late had a predictable tournament and one
 * swinging −30/+180 had a chaotic one at the same mean, and operators read
 * minutes rather than sigma.
 */
export function wrapParticipantExperienceReport({
  tournamentRecord,
  parameters,
}: WrapArgs): ReportResult | { error: any } {
  const utcOffsetMinutes = parameters?.utcOffsetMinutes ?? 0;
  const timeZone = parameters?.timeZone;
  const { byParticipant, participantNameMap, estimatedCount, totalCount } = buildRecoveryTimeline({
    policyDefinitions: parameters?.policyDefinitions,
    asOfMs: parameters?.asOfMs,
    utcOffsetMinutes,
    tournamentRecord,
    timeZone,
  });

  if (!totalCount) return { error: 'No played matchUps with resolvable times' };

  const columns = [
    { key: 'participantName', title: 'Participant', type: 'string' as const },
    { key: 'daysPlayed', title: 'Days', type: 'number' as const, width: 70 },
    { key: 'matchesPlayed', title: 'Matches', type: 'number' as const, width: 85 },
    { key: 'busiestDayMatches', title: 'Busiest Day', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'courtMinutes', title: 'On Court', type: 'number' as const, width: 90, headerWordWrap: true },
    { key: 'estimatedPct', title: 'Estimated %', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'shortRecoveryCount', title: 'Short Rests', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'worstRecoveryDeficit', title: 'Worst Deficit', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'shortOvernightCount', title: 'Short Nights', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'worstOvernight', title: 'Worst Night', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'meanWaitMinutes', title: 'Mean Wait', type: 'number' as const, width: 90, headerWordWrap: true },
    { key: 'maxWaitMinutes', title: 'Max Wait', type: 'number' as const, width: 90, headerWordWrap: true },
    { key: 'longestDayMinutes', title: 'Longest Day', type: 'number' as const, width: 95, headerWordWrap: true },
  ];

  const rows: Record<string, any>[] = [];

  for (const [participantId, appearances] of byParticipant) {
    const acc: Accumulator = {
      shortOvernightCount: 0,
      worstRecoveryDeficit: 0,
      shortRecoveryCount: 0,
      longestDayMinutes: 0,
      busiestDayMatches: 0,
      estimatedRows: 0,
      courtMinutes: 0,
      waitTotal: 0,
      waitCount: 0,
      matches: appearances.length,
      days: new Set(),
    };

    appearances.forEach((appearance, index) => {
      acc.days.add(appearance.scheduledDate);
      acc.courtMinutes += appearance.durationMinutes;
      if (appearance.durationSource === 'estimated') acc.estimatedRows += 1;

      if (appearance.scheduledMs !== undefined && appearance.calledMs !== undefined) {
        const wait = minutesBetween(appearance.scheduledMs, appearance.calledMs);
        acc.waitTotal += wait;
        acc.waitCount += 1;
        if (acc.maxWaitMinutes === undefined || wait > acc.maxWaitMinutes) acc.maxWaitMinutes = wait;
      }

      if (!index) return;
      const previous = appearances[index - 1];
      const gap = minutesBetween(previous.finishMs, appearance.startMs);

      if (previous.scheduledDate === appearance.scheduledDate) {
        const deficit = requiredAfter(previous, appearance) - gap;
        if (deficit > 0) {
          acc.shortRecoveryCount += 1;
          if (deficit > acc.worstRecoveryDeficit) acc.worstRecoveryDeficit = deficit;
        }
        return;
      }

      // Cross-day. An overnight requirement of 0 means "no rule configured" —
      // counting a short night against it would invent a constraint.
      const overnightRequired = appearance.overnightMinutes ?? 0;
      if (acc.worstOvernightReceived === undefined || gap < acc.worstOvernightReceived) {
        acc.worstOvernightReceived = gap;
      }
      if (overnightRequired > 0 && gap < overnightRequired) acc.shortOvernightCount += 1;
    });

    accumulateDays(appearances, acc);

    rows.push({
      participantId,
      participantName: participantNameMap[participantId] ?? participantId,
      daysPlayed: acc.days.size,
      matchesPlayed: acc.matches,
      busiestDayMatches: acc.busiestDayMatches,
      courtMinutes: acc.courtMinutes,
      estimatedPct: acc.matches ? Math.round((acc.estimatedRows / acc.matches) * 100) : 0,
      shortRecoveryCount: acc.shortRecoveryCount,
      worstRecoveryDeficit: acc.worstRecoveryDeficit,
      shortOvernightCount: acc.shortOvernightCount,
      worstOvernight: acc.worstOvernightReceived,
      meanWaitMinutes: acc.waitCount ? Math.round(acc.waitTotal / acc.waitCount) : undefined,
      maxWaitMinutes: acc.maxWaitMinutes,
      longestDayMinutes: acc.longestDayMinutes,
    });
  }

  rows.sort(
    (a, b) =>
      b.shortRecoveryCount - a.shortRecoveryCount ||
      b.worstRecoveryDeficit - a.worstRecoveryDeficit ||
      (b.maxWaitMinutes ?? -Infinity) - (a.maxWaitMinutes ?? -Infinity) ||
      String(a.participantName).localeCompare(String(b.participantName)),
  );

  return {
    reportId: PARTICIPANT_EXPERIENCE_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary: {
      participants: rows.length,
      appearances: totalCount,
      participantsWithShortRecovery: rows.filter((row) => row.shortRecoveryCount > 0).length,
      participantsWithShortOvernight: rows.filter((row) => row.shortOvernightCount > 0).length,
      estimatedDurationPercentage: totalCount ? Math.round((estimatedCount / totalCount) * 100) : 0,
      utcOffsetMinutes,
      timeZone,
    },
  };
}
