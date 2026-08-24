import { buildRecoveryTimeline, localParts, MS_PER_MINUTE, TimelineAppearance } from '../recoveryTimeline';

// Constants and Types
import { PARTICIPANT_RECOVERY_REPORT } from '@Constants/reportConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ReportResult } from '@Types/reportTypes';

type WrapArgs = {
  tournamentRecord: Tournament;
  parameters?: { utcOffsetMinutes?: number; timeZone?: string; policyDefinitions?: any; asOfMs?: number };
};

/** Signed minutes between two instants, rounded to whole minutes. */
const minutesBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / MS_PER_MINUTE);

/**
 * Recovery required after `previous`, before the next matchUp begins.
 *
 * Recovery is a property of the matchUp just *completed* — the scheduler reads it
 * the same way (`updateTimeAfterRecovery` computes when a participant is next
 * free from the matchUp they have just finished). When the participant crosses
 * singles ↔ doubles, the previous matchUp's `typeChangeRecoveryMinutes` applies
 * instead, which is generally the larger figure.
 */
function requiredAfter(previous: TimelineAppearance, next: TimelineAppearance): number {
  const typeChanged = !!previous.matchUpType && !!next.matchUpType && previous.matchUpType !== next.matchUpType;
  if (typeChanged && previous.typeChangeRecoveryMinutes) return previous.typeChangeRecoveryMinutes;
  return previous.recoveryMinutes;
}

/**
 * Participant Recovery Time — one row per individual participant per matchUp
 * played, in chronological order, spanning every day of the tournament.
 *
 * Each row reports what the participant actually got between this matchUp and
 * their previous one, against what the scheduling policy required:
 *
 * - `recoveryReceived` / `recoveryRequired` / `recoveryDeficit` — same-day gap.
 *   Deficit is positive when the participant was short-changed.
 * - `overnightReceived` / `overnightRequired` — the gap from the previous day's
 *   last finish. Invisible to the day-scoped Inspector analysis, and the rule
 *   with the largest figure attached (12 hours, junior divisions).
 * - `waitMinutes` — planned `scheduledTime` to actual `calledAt`. The "told
 *   10:00, walked on at 12:40" number, projected onto the person who lived it.
 * - `finishSource` / `durationSource` — which rung of each ladder produced the
 *   figure, so an inferred number never reads as a measured one.
 *
 * `parameters.utcOffsetMinutes` is the venue's offset from UTC (local = UTC +
 * offset); `parameters.policyDefinitions` evaluates the tournament against a
 * policy other than the one attached to it.
 */
export function wrapRecoveryTimeReport({ tournamentRecord, parameters }: WrapArgs): ReportResult | { error: any } {
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
    { key: 'scheduledDate', title: 'Date', type: 'date' as const, fitData: true, width: 110 },
    { key: 'matchNumber', title: '#', type: 'number' as const, width: 60 },
    { key: 'eventName', title: 'Event', type: 'string' as const, fitData: true },
    { key: 'roundName', title: 'Round', type: 'string' as const, fitData: true },
    { key: 'startTime', title: 'Start', type: 'string' as const, fitData: true },
    { key: 'finishTime', title: 'Finish', type: 'string' as const, fitData: true },
    { key: 'durationMinutes', title: 'On Court', type: 'number' as const, width: 90, headerWordWrap: true },
    { key: 'durationSource', title: 'Duration From', type: 'string' as const, fitData: true, headerWordWrap: true },
    { key: 'recoveryReceived', title: 'Recovery', type: 'number' as const, width: 90 },
    { key: 'recoveryRequired', title: 'Required', type: 'number' as const, width: 90 },
    { key: 'recoveryDeficit', title: 'Deficit', type: 'number' as const, width: 90 },
    { key: 'overnightReceived', title: 'Overnight', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'overnightRequired', title: 'Overnight Req', type: 'number' as const, width: 95, headerWordWrap: true },
    { key: 'waitMinutes', title: 'Wait', type: 'number' as const, width: 80 },
    { key: 'finishSource', title: 'Finish From', type: 'string' as const, fitData: true, headerWordWrap: true },
  ];

  const frame = { utcOffsetMinutes, timeZone };
  const rows: Record<string, any>[] = [];

  for (const [participantId, appearances] of byParticipant) {
    let ordinalDate = '';
    let ordinal = 0;

    appearances.forEach((appearance, index) => {
      if (appearance.scheduledDate !== ordinalDate) {
        ordinalDate = appearance.scheduledDate;
        ordinal = 0;
      }
      ordinal += 1;

      const previous = index > 0 ? appearances[index - 1] : undefined;
      const sameDay = previous?.scheduledDate === appearance.scheduledDate;

      const gapMinutes = previous ? minutesBetween(previous.finishMs, appearance.startMs) : undefined;
      const required = previous ? requiredAfter(previous, appearance) : undefined;

      // A same-day gap is measured against `recoveryMinutes`; a cross-day gap
      // against `overnightMinutes`. Reporting one against the other would
      // manufacture either a huge surplus or a huge deficit on every first
      // matchUp of the day.
      const recoveryReceived = previous && sameDay ? gapMinutes : undefined;
      const recoveryRequired = previous && sameDay ? required : undefined;
      const overnightReceived = previous && !sameDay ? gapMinutes : undefined;
      const overnightRequired = previous && !sameDay ? appearance.overnightMinutes : undefined;

      const deficit =
        recoveryReceived !== undefined && recoveryRequired !== undefined
          ? Math.max(0, recoveryRequired - recoveryReceived)
          : undefined;

      const waitMinutes =
        appearance.scheduledMs !== undefined && appearance.calledMs !== undefined
          ? minutesBetween(appearance.scheduledMs, appearance.calledMs)
          : undefined;

      rows.push({
        // Location ids for navigation; hidden by consumers, retained in export.
        structureId: appearance.structureId,
        matchUpId: appearance.matchUpId,
        eventId: appearance.eventId,
        drawId: appearance.drawId,

        participantId,
        participantName: participantNameMap[participantId] ?? participantId,
        scheduledDate: appearance.scheduledDate,
        matchNumber: ordinal,
        eventName: appearance.eventName,
        drawName: appearance.drawName,
        roundName: appearance.roundName,
        startTime: localParts(appearance.startMs, frame).time,
        finishTime: localParts(appearance.finishMs, frame).time,
        durationMinutes: appearance.durationMinutes,
        durationSource: appearance.durationSource,
        recoveryReceived,
        recoveryRequired,
        recoveryDeficit: deficit,
        overnightReceived,
        overnightRequired,
        waitMinutes,
        finishSource: appearance.finishSource,
      });
    });
  }

  // Worst experience first: largest deficit, then longest wait — an operator
  // opening this report is looking for who was treated worst, not for row one.
  rows.sort(
    (a, b) =>
      (b.recoveryDeficit ?? -1) - (a.recoveryDeficit ?? -1) ||
      (b.waitMinutes ?? -Infinity) - (a.waitMinutes ?? -Infinity) ||
      String(a.participantName).localeCompare(String(b.participantName)) ||
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.matchNumber - b.matchNumber,
  );

  const deficits = rows.map((row) => row.recoveryDeficit).filter((value) => typeof value === 'number');
  const shortRecoveries = deficits.filter((value) => value > 0);

  return {
    reportId: PARTICIPANT_RECOVERY_REPORT,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
    summary: {
      appearances: totalCount,
      participants: byParticipant.size,
      shortRecoveryCount: shortRecoveries.length,
      worstRecoveryDeficit: shortRecoveries.length ? Math.max(...shortRecoveries) : 0,
      // What proportion of the court time in this report is the scheduling
      // policy's prediction rather than an observation. Without this, an average
      // built mostly from estimates reads as a finding.
      estimatedDurationCount: estimatedCount,
      estimatedDurationPercentage: totalCount ? Math.round((estimatedCount / totalCount) * 100) : 0,
      utcOffsetMinutes,
      timeZone,
    },
  };
}
