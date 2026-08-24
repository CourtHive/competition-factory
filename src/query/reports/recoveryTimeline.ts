/**
 * Participant recovery timeline — the retrospective counterpart to TMX's live
 * Inspector rest analysis.
 *
 * The Inspector answers *"how long has this player had off, as of now"* for one
 * decision on one day. This answers *"across the whole tournament, what was each
 * participant's experience of time"* — recovery actually received between
 * matchUps, time actually spent on court, and time spent waiting.
 *
 * Two properties follow from being retrospective, and both are load-bearing:
 *
 * 1. **It is not day-scoped.** The Inspector scopes rest to one calendar day by
 *    design, which makes overnight turnaround structurally invisible — and the
 *    overnight rule carries the largest figure in the rulebook (12 hours between
 *    a junior's last matchUp of one day and the first of the next). Spanning days
 *    is the whole point.
 * 2. **It needs no clock.** Every anchor is historical, so the factory's purity
 *    is not strained. `asOfMs` exists only to bound an in-progress tournament and
 *    is supplied by the caller, never read from a clock here.
 *
 * ── Time representation ──
 *
 * The underlying values sit in two different frames: `endTime` / `startTime` /
 * `scheduledTime` are bare `HH:MM` venue-local wall clock, while `calledAt` and
 * `scoredTime` are full UTC ISO instants. Mixing them without an explicit
 * conversion yields a figure wrong by the UTC offset, which is worse than
 * showing nothing. Everything here is normalised to **UTC milliseconds** at the
 * single pair of entry points below, given the venue's `utcOffsetMinutes`
 * (local = UTC + offset).
 *
 * ── The honesty rule ──
 *
 * Two quantities are *derived* and neither has a single source, so every row
 * reports which rung produced it. An inferred number must never read as a
 * measured one; a report that quietly presents `averageMinutes` as "time on
 * court" is a restatement of the scheduling policy wearing the costume of an
 * observation.
 */

import { getMatchUpFormatTiming } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';
import { zonedWallClockToMs, zonedParts } from '@Tools/zonedTime';

import { DOUBLES_MATCHUP } from '@Constants/matchUpTypes';
import { Tournament } from '@Types/tournamentTypes';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;

/**
 * How long after its start a matchUp's finish may plausibly land.
 *
 * `scoredTime` is stamped when the score is *entered*, not when play ended. That
 * is usually within minutes of the finish, which is why it is the workhorse rung
 * — but a score entered the next morning, or corrected days later, is not a
 * finish proxy at all. Unbounded, such a stamp yields a matchUp that "ran" for
 * three days, an absurd duration, and a day span to match.
 *
 * Twelve hours comfortably covers any real match including long weather
 * suspensions, while excluding next-day entry. Past it the ladder falls through
 * to a projection from the start, which is wrong by minutes rather than by days.
 */
const MAX_PLAUSIBLE_MATCH_MINUTES = 12 * 60;

/** Which rung of the finish ladder produced a matchUp's end anchor. */
export type FinishSource = 'endTime' | 'scoredTime' | 'startTime' | 'calledAt' | 'scheduledTime';

/** Which rung produced the time-on-court figure. `estimated` is not an observation. */
export type DurationSource = 'measured' | 'scoredTime' | 'calledAt' | 'estimated';

/**
 * Statuses that advance a participant without their playing.
 *
 * Ported from TMX `participantRest.ts` rather than re-derived, so the report and
 * the Inspector badge cannot disagree about what counts as a matchUp played.
 * `completedMatchUpStatuses` is NOT usable here: it includes every walkover and
 * default, so reusing it charges a player full recovery, a daily ordinal and
 * estimated court time for a matchUp they never played.
 *
 * `CANCELLED` is present here and absent from the TMX set only because it falls
 * outside that module's domain — a cancelled matchUp plainly put nobody on court.
 * `RETIRED` and `ABANDONED` are deliberately absent from this set: both mean time
 * was spent on court.
 */
const UNPLAYED_STATUSES = new Set(['WALKOVER', 'DOUBLE_WALKOVER', 'CANCELLED']);
const DEFAULT_STATUSES = new Set(['DEFAULTED', 'DOUBLE_DEFAULT']);

/** True when this matchUp actually put its participants on court. */
export function wasPlayed(matchUp: any): boolean {
  const status = matchUp?.matchUpStatus;
  if (status && UNPLAYED_STATUSES.has(status)) return false;
  // A default with a score was played up to the point of the default; a default
  // with no score is a no-show. Nothing else about the record tells them apart.
  if (status && DEFAULT_STATUSES.has(status)) return !!matchUp?.score?.sets?.length;
  return true;
}

/**
 * The venue frame every conversion in this module runs through.
 *
 * A bare `utcOffsetMinutes` is the offset at ONE moment, so a tournament that
 * spans a DST change converts an hour wrong on the far side of it — silently,
 * in a report whose entire subject is minutes. Supplying an IANA `timeZone`
 * resolves the offset per instant instead. Both are carried because the offset
 * path stays correct for the great majority of tournaments and remains the
 * fallback when a zone is absent or unrecognised.
 */
type VenueFrame = { utcOffsetMinutes: number; timeZone?: string };

/** `YYYY-MM-DD` + `HH:MM` venue-local → UTC ms. Null when either part is missing or malformed. */
function wallClockToMs(date: string | undefined, time: string | undefined, frame: VenueFrame): number | null {
  return zonedWallClockToMs({ ...frame, date, time });
}

/**
 * Whether a candidate finish sits a plausible distance after a known start.
 *
 * Guards the score-entry rungs against a stamp that records bookkeeping rather
 * than play. Returns false when there is no start to measure against, so an
 * unanchored score never becomes a duration.
 */
function isPlausibleFinish(finishMs: number, startMs: number | null): boolean {
  if (startMs === null) return false;
  const elapsed = finishMs - startMs;
  return elapsed > 0 && elapsed <= MAX_PLAUSIBLE_MATCH_MINUTES * MS_PER_MINUTE;
}

/** UTC ISO instant → UTC ms. Null when absent or unparseable. */
function isoToMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** UTC ms → venue-local calendar date + wall clock. */
function localParts(ms: number, frame: VenueFrame): { date: string; time: string } {
  return zonedParts({ ...frame, ms });
}

/**
 * When the matchUp began, strongest rung first: an operator-recorded start, the
 * moment it was called to court, then the plan.
 */
function resolveStart(schedule: any, frame: VenueFrame): { ms: number; source: string } | null {
  const started = wallClockToMs(schedule?.scheduledDate, schedule?.startTime, frame);
  if (started !== null) return { ms: started, source: 'startTime' };
  const called = isoToMs(schedule?.calledAt);
  if (called !== null) return { ms: called, source: 'calledAt' };
  const planned = wallClockToMs(schedule?.scheduledDate, schedule?.scheduledTime, frame);
  if (planned !== null) return { ms: planned, source: 'scheduledTime' };
  return null;
}

/**
 * When the matchUp finished, strongest rung first.
 *
 * Rung 2 (`scoredTime`) carries the load in practice, not rung 1: TMX writes
 * `END_TIME` only on an explicit operator action, while the factory auto-captures
 * `scoredTime` on every first meaningful score. A late-entered score pushes the
 * anchor *after* the true finish, so recovery is understated — the conservative
 * direction, since it reports a player as less rested rather than more.
 */
function resolveFinish(
  schedule: any,
  averageMinutes: number,
  startMs: number | null,
  frame: VenueFrame,
): { ms: number; source: FinishSource } | null {
  // `endDate` is sparse and only present when the matchUp crossed midnight.
  const ended = wallClockToMs(schedule?.endDate ?? schedule?.scheduledDate, schedule?.endTime, frame);
  if (ended !== null) return { ms: ended, source: 'endTime' };

  const projected = averageMinutes * MS_PER_MINUTE;
  const startedMs = wallClockToMs(schedule?.scheduledDate, schedule?.startTime, frame);

  const scored = isoToMs(schedule?.scoredTime);
  if (scored !== null && isPlausibleFinish(scored, startedMs ?? startMs)) {
    return { ms: scored, source: 'scoredTime' };
  }

  if (startedMs !== null) return { ms: startedMs + projected, source: 'startTime' };

  const called = isoToMs(schedule?.calledAt);
  if (called !== null) return { ms: called + projected, source: 'calledAt' };

  if (startMs !== null) return { ms: startMs + projected, source: 'scheduledTime' };
  return null;
}

/**
 * Time on court. Rung 4 is not an observation at all — it is the scheduling
 * policy's prediction — which is why `durationSource` travels with every figure
 * and why the summary counts how many rows landed there.
 */
function resolveDuration(
  schedule: any,
  averageMinutes: number,
  frame: VenueFrame,
): { minutes: number; source: DurationSource } {
  const startedMs = wallClockToMs(schedule?.scheduledDate, schedule?.startTime, frame);
  const endedMs = wallClockToMs(schedule?.endDate ?? schedule?.scheduledDate, schedule?.endTime, frame);
  const scoredMs = isoToMs(schedule?.scoredTime);
  const calledMs = isoToMs(schedule?.calledAt);

  if (startedMs !== null && endedMs !== null && endedMs > startedMs) {
    return { minutes: Math.round((endedMs - startedMs) / MS_PER_MINUTE), source: 'measured' };
  }
  if (startedMs !== null && scoredMs !== null && isPlausibleFinish(scoredMs, startedMs)) {
    return { minutes: Math.round((scoredMs - startedMs) / MS_PER_MINUTE), source: 'scoredTime' };
  }
  if (calledMs !== null && scoredMs !== null && isPlausibleFinish(scoredMs, calledMs)) {
    return { minutes: Math.round((scoredMs - calledMs) / MS_PER_MINUTE), source: 'calledAt' };
  }
  return { minutes: averageMinutes, source: 'estimated' };
}

/** Every individual behind a side — recovery is a property of a person, not of an entry. */
function sideIndividualIds(side: any, matchUpType?: string): string[] {
  if (!side) return [];
  if (matchUpType === DOUBLES_MATCHUP) {
    const ids = side.participant?.individualParticipantIds ?? [];
    return ids.length ? ids : [side.participantId].filter(Boolean);
  }
  return [side.participantId ?? side.participant?.participantId].filter(Boolean);
}

export type TimelineAppearance = {
  recoveryFromPlayedMinutes: boolean;
  typeChangeRecoveryMinutes: number;
  overnightMinutes?: number;
  durationSource: DurationSource;
  finishSource: FinishSource;
  durationMinutes: number;
  recoveryMinutes: number;
  averageMinutes: number;
  scheduledDate: string;
  participantId: string;
  matchUpType?: string;
  scheduledMs?: number;
  structureId?: string;
  matchUpId: string;
  roundName: string;
  eventName: string;
  calledMs?: number;
  drawName: string;
  eventId?: string;
  finishMs: number;
  drawId?: string;
  startMs: number;
};

type BuildArgs = {
  policyDefinitions?: any;
  utcOffsetMinutes?: number;
  tournamentRecord: Tournament;
  /** IANA zone identifier; when supplied it wins over `utcOffsetMinutes` and is DST-correct. */
  timeZone?: string;
  /** Bound for an in-progress tournament; caller-supplied, never read from a clock here. */
  asOfMs?: number;
};

/**
 * One entry per (individual participant × matchUp played), chronologically
 * ordered per participant. The shared core behind both the per-appearance log and
 * the per-participant roll-up, so the two can never disagree.
 */
export function buildRecoveryTimeline({
  policyDefinitions,
  utcOffsetMinutes = 0,
  tournamentRecord,
  timeZone,
  asOfMs,
}: BuildArgs): {
  byParticipant: Map<string, TimelineAppearance[]>;
  participantNameMap: Record<string, string>;
  estimatedCount: number;
  totalCount: number;
} {
  const frame: VenueFrame = { utcOffsetMinutes, timeZone };
  const { matchUps } = allTournamentMatchUps({ tournamentRecord, inContext: true });
  const { participants } = getParticipants({ tournamentRecord, withIndividualParticipants: true });

  const participantNameMap: Record<string, string> = {};
  for (const participant of participants ?? []) {
    participantNameMap[participant.participantId] = participant.participantName ?? '';
  }

  const { eventNames, drawNames, eventsById } = buildNameMaps(tournamentRecord);
  const timingFor = makeTimingResolver({ tournamentRecord, policyDefinitions, eventsById });

  const byParticipant = new Map<string, TimelineAppearance[]>();
  let estimatedCount = 0;
  let totalCount = 0;

  for (const matchUp of (matchUps ?? []) as any[]) {
    const appearances = appearancesForMatchUp({
      eventNames,
      frame,
      drawNames,
      timingFor,
      matchUp,
      asOfMs,
    });

    for (const appearance of appearances) {
      totalCount += 1;
      if (appearance.durationSource === 'estimated') estimatedCount += 1;
      const existing = byParticipant.get(appearance.participantId);
      if (existing) existing.push(appearance);
      else byParticipant.set(appearance.participantId, [appearance]);
    }
  }

  for (const appearances of byParticipant.values()) appearances.sort((a, b) => a.startMs - b.startMs);

  return { byParticipant, participantNameMap, estimatedCount, totalCount };
}

/** `eventId`/`drawId` → display names, plus events by id for category resolution. */
function buildNameMaps(tournamentRecord: Tournament) {
  const eventNames: Record<string, string> = {};
  const drawNames: Record<string, string> = {};
  const eventsById: Record<string, any> = {};
  for (const event of tournamentRecord.events ?? []) {
    eventNames[event.eventId] = event.eventName ?? '';
    eventsById[event.eventId] = event;
    for (const draw of event.drawDefinitions ?? []) drawNames[draw.drawId] = draw.drawName ?? '';
  }
  return { eventNames, drawNames, eventsById };
}

/**
 * Timing resolved per (format × matchUpType × event × playedMinutes) — a
 * tournament has a handful of distinct combinations, not one per matchUp.
 */
function makeTimingResolver({ tournamentRecord, policyDefinitions, eventsById }: any) {
  const cache = new Map<string, any>();
  return (matchUp: any, playedMinutes?: number) => {
    const key = [matchUp.matchUpFormat, matchUp.matchUpType, matchUp.eventId, playedMinutes].join('|');
    const cached = cache.get(key);
    if (cached) return cached;

    const event = eventsById[matchUp.eventId];
    const category = event?.category;
    const timing: any = getMatchUpFormatTiming({
      categoryName: category?.categoryName ?? category?.ageCategoryCode,
      // Passed explicitly as well as via `event`: an explicit value still wins,
      // and published factories at or below 6.29.1 discard the resolved one.
      categoryType: category?.categoryType ?? category?.subType,
      matchUpFormat: matchUp.matchUpFormat ?? '',
      eventType: matchUp.matchUpType,
      policyDefinitions,
      tournamentRecord,
      playedMinutes,
      event,
    });
    const resolved = timing?.error ? {} : timing;
    cache.set(key, resolved);
    return resolved;
  };
}

/** Every individual appearance a single matchUp contributes, or an empty list. */
function appearancesForMatchUp({
  eventNames,
  drawNames,
  timingFor,
  matchUp,
  asOfMs,
  frame,
}: any): TimelineAppearance[] {
  if (!wasPlayed(matchUp)) return [];

  const schedule = matchUp.schedule ?? {};
  const baseTiming = timingFor(matchUp);
  const averageMinutes = baseTiming?.averageMinutes ?? 90;

  const start = resolveStart(schedule, frame);
  if (!start) return []; // genuinely undatable — excluded rather than guessed at
  if (asOfMs !== undefined && start.ms > asOfMs) return [];

  const duration = resolveDuration(schedule, averageMinutes, frame);
  const finish = resolveFinish(schedule, averageMinutes, start.ms, frame);
  if (!finish) return [];

  // A measured or proxied duration may key a `byPlayedMinutes` band; an estimated
  // one may not — banding on `averageMinutes` selects the band by the very number
  // the policy already predicted.
  const playedMinutes = duration.source === 'estimated' ? undefined : duration.minutes;
  const timing = playedMinutes === undefined ? baseTiming : timingFor(matchUp, playedMinutes);

  const individualIds = [
    ...sideIndividualIds(matchUp.sides?.[0], matchUp.matchUpType),
    ...sideIndividualIds(matchUp.sides?.[1], matchUp.matchUpType),
  ].filter(Boolean);

  return individualIds.map((participantId: string) => ({
    scheduledMs: wallClockToMs(schedule.scheduledDate, schedule.scheduledTime, frame) ?? undefined,
    roundName: matchUp.roundName ?? (matchUp.roundNumber ? `R${matchUp.roundNumber}` : ''),
    recoveryFromPlayedMinutes: !!timing?.recoveryFromPlayedMinutes,
    typeChangeRecoveryMinutes: timing?.typeChangeRecoveryMinutes ?? 0,
    scheduledDate: localParts(start.ms, frame).date,
    calledMs: isoToMs(schedule.calledAt) ?? undefined,
    overnightMinutes: timing?.overnightMinutes,
    recoveryMinutes: timing?.recoveryMinutes ?? 0,
    eventName: eventNames[matchUp.eventId] ?? '',
    drawName: drawNames[matchUp.drawId] ?? '',
    durationMinutes: duration.minutes,
    durationSource: duration.source,
    structureId: matchUp.structureId,
    matchUpType: matchUp.matchUpType,
    matchUpId: matchUp.matchUpId,
    finishSource: finish.source,
    eventId: matchUp.eventId,
    drawId: matchUp.drawId,
    finishMs: finish.ms,
    startMs: start.ms,
    averageMinutes,
    participantId,
  }));
}

export { MS_PER_MINUTE, MINUTES_PER_DAY, localParts };
export type { VenueFrame };
