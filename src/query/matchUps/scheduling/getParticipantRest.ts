/**
 * Participant rest — *for each individual in this matchUp, how long have they
 * actually had off, and is that enough?*
 *
 * The question a director asks before calling a match to court. Deliberately
 * NOT the question `getMatchUpReadiness` answers: readiness is anchored on the
 * target's own `scheduledTime` and skips when there is not one, while rest is
 * anchored on a caller-supplied **now**, so it answers for a matchUp still
 * sitting in a catalog — which is exactly the moment the director is deciding
 * whether to send it out.
 *
 * ── Provenance ──
 *
 * Ported from TMX, which built it behind an adapter (`RestInput` →
 * `RestResult`) so this move would be a body swap; its header named
 * `getParticipantRest` as the destination and predicted the shape of the
 * relocation: *"the factory is pure and has no clock, so it would take the same
 * injected `asOfMinutes` — the `calledAt` idiom of a caller-supplied wall
 * clock."* That is what `asOf` is.
 *
 * ── What changed in the move, and why ──
 *
 * TMX normalised every time to **minutes since midnight of the day being
 * viewed**, because a browser module cannot resolve a named zone without
 * duplicating the zone machinery. It paid for that in apparatus: a ±1-day
 * offset for genuine midnight crossings, a clamp that made a stamp from another
 * date read by its time-of-day, and a projected "now" for a non-today view.
 *
 * Here every instant is **UTC milliseconds**, resolved through the same
 * `zonedDateTime` frame `recoveryTimeline` uses. The apparatus is not ported
 * because it has nothing to do: a real interval between two instants is
 * computable, midnight crossings need no special case, and `asOf` is a genuine
 * instant rather than a projection. The frame is DST-correct when the caller
 * supplies an IANA zone, which a fixed offset cannot be.
 *
 * The public row shape is unchanged, so a consumer swapping its local copy for
 * this query changes an import and nothing else.
 *
 * ── The precedence ladder ──
 *
 * "When did this participant's previous match end" has five answers of
 * decreasing fidelity, and every row reports which one it used so an inferred
 * number never reads as a measured one:
 *
 *   1. `endTime`       operator recorded the actual finish        — measured
 *   2. `scoredTime`    when the score was entered                 — proxy
 *   3. `startTime`     + averageMinutes, match started            — projected
 *   4. `calledAt`      + averageMinutes, called to court          — projected
 *   5. `scheduledTime` + averageMinutes, plan only                — planned
 *
 * Rung 2 is the common path, not the exception: an END_TIME is written only on
 * an explicit operator action, while `scoredTime` is auto-captured on every
 * first meaningful score. A late-entered score pushes the anchor *after* the
 * true finish, so rest is understated — the conservative direction, since it
 * holds a rested player back rather than calling a tired one.
 *
 * The ladder degrades on **unusable**, not merely on absent. A rung that holds
 * a value can still be unreadable — anything landing after `asOf` is not a
 * finish that has happened — so every rung is resolved and the strongest one
 * actually behind the clock wins. `anchorUnreliable` is reserved for the case
 * where the whole ladder is in the future.
 */
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getDailyLimit } from '@Query/extensions/getMatchUpDailyLimits';
import { zonedWallClockToMs, zonedParts } from '@Tools/zonedDateTime';
import { makeTimingResolver, SchedulingTiming } from './schedulingTiming';
import { wasPlayed } from '@Query/reports/recoveryTimeline';
import { individualIds, isFinished, matchUpLabel, nameFor } from './getMatchUpReadiness';

// constants and types
import { MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';

const MS_PER_MINUTE = 60_000;

/**
 * How far after its own start a recorded finish may sit and still be a finish.
 * Twelve hours covers any real match including a long weather suspension, while
 * excluding a score entered the next day. Matches the bound
 * `recoveryTimeline.ts` applies, so the live analysis and the retrospective
 * report reject the same stamps.
 */
const MAX_PLAUSIBLE_MATCH_MS = 12 * 60 * MS_PER_MINUTE;

/** Which rung of the ladder produced a participant's rest anchor. */
export type RestSourceKind = 'endTime' | 'scoredTime' | 'startTime' | 'calledAt' | 'scheduledTime';

/** How much of the required recovery a participant has actually had. */
export type RestStatus = 'onCourt' | 'resting' | 'rested' | 'none';

/** True only for the rung the operator recorded directly; everything else is inferred. */
export const MEASURED_SOURCE: RestSourceKind = 'endTime';

/** How many matches a participant has already begun today, and against which limits. */
export type RestDailyLoad = {
  singles: number;
  doubles: number;
  total: number;
  /** Position the inspected matchUp would take, e.g. `3` for "3rd match today". */
  ordinal: number;
  /** Limits this matchUp would meet or exceed. Empty when no limits are configured. */
  atLimit: ('singles' | 'doubles' | 'total')[];
  /** The limit figure the ordinal should be read against, when one applies. */
  limit?: number;
};

export type RestRow = {
  participantId: string;
  participantName: string;
  status: RestStatus;
  /** Minutes rested so far. Absent for `onCourt` and `none`. */
  restMinutes?: number;
  /** Recovery this participant owes before the inspected matchUp. */
  requiredMinutes: number;
  /** True when `requiredMinutes` came from the singles ↔ doubles figure. */
  typeChange: boolean;
  /** Venue wall clock the requirement is met, `HH:MM`. Absent when already met or unprojectable. */
  readyAt?: string;
  /**
   * True when the participant is still on court past the point their format was
   * expected to finish. The projected finish is now in the past, so `readyAt` is
   * withheld rather than naming a time that has already gone by.
   */
  overrun?: boolean;
  /**
   * True when every anchor available for this participant projects into the
   * future — the match is recorded as finished but nothing says when. Rest is
   * reported as zero rather than guessed.
   */
  anchorUnreliable?: boolean;
  /** Which rung produced the anchor. Absent for `none`. */
  source?: RestSourceKind;
  /**
   * Rungs the ladder passed over on its way to `source`, strongest first.
   * Present only when something was actually skipped.
   *
   * A silent fall-through is a fix that hides its own cause: the row reads as a
   * clean estimate while a recorded stamp sits in the record contradicting it.
   */
  discardedSources?: RestSourceKind[];
  /** The matchUp the rest is measured from. Absent for `none`. */
  fromMatchUpId?: string;
  fromMatchUpLabel?: string;
  load: RestDailyLoad;
};

/** Why rest could not be evaluated. Never reported as "rested" — an unevaluated matchUp is not a clean one. */
export type RestSkipReason = 'unknownMatchUp' | 'bye' | 'completed' | 'noParticipants' | 'noAsOf' | 'noDay';

export type RestResult =
  | { evaluated: false; reason: RestSkipReason }
  | { evaluated: true; asOf: string; scheduledDate: string; rows: RestRow[] };

/** Daily match limits, as the scheduling policy declares them. Any subset may be absent. */
export type RestDailyLimits = { SINGLES?: number; DOUBLES?: number; total?: number };

type Frame = { utcOffsetMinutes: number; timeZone?: string };

/** Every time on a matchUp, as UTC milliseconds. */
type NormalizedTimes = {
  endMs: number | null;
  scoredMs: number | null;
  /** Venue calendar date of `scoredTime` — what dates a matchUp carrying no `scheduledDate`. */
  scoredDate: string | null;
  startMs: number | null;
  calledMs: number | null;
  scheduledMs: number | null;
};

function isoToMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function wallClockToMs(date: string | undefined, time: string | undefined, frame: Frame): number | null {
  return zonedWallClockToMs({ ...frame, date, time })?.ms ?? null;
}

function localClock(ms: number, frame: Frame): string {
  return zonedParts({ ...frame, ms })?.time ?? '';
}

function localDate(ms: number | null, frame: Frame): string | null {
  return ms === null ? null : (zonedParts({ ...frame, ms })?.date ?? null);
}

export function normalizeTimes(matchUp: HydratedMatchUp, frame: Frame): NormalizedTimes {
  const schedule: any = matchUp.schedule ?? {};
  const scoredMs = isoToMs(schedule.scoredTime);
  return {
    // END_DATE is written only when the match crossed midnight, so it dates the
    // bare endTime whenever it is present.
    endMs: wallClockToMs(schedule.endDate ?? schedule.scheduledDate, schedule.endTime, frame),
    scoredMs,
    scoredDate: localDate(scoredMs, frame),
    startMs: wallClockToMs(schedule.scheduledDate, schedule.startTime, frame),
    calledMs: isoToMs(schedule.calledAt),
    scheduledMs: wallClockToMs(schedule.scheduledDate, schedule.scheduledTime, frame),
  };
}

/**
 * Whether a matchUp belongs to the day being measured.
 *
 * `scheduledDate` answers it outright. When it is absent — which is what a score
 * entered from a draw view leaves behind — the venue calendar date of
 * `scoredTime` still dates the match. A matchUp with neither is genuinely
 * undatable and is excluded, since counting it would be a guess about which
 * day's rest it belongs to.
 */
export function occursOnDay(matchUp: HydratedMatchUp, times: NormalizedTimes, day: string): boolean {
  const scheduledDate = matchUp.schedule?.scheduledDate;
  if (scheduledDate) return scheduledDate === day;
  return times.scoredDate !== null && times.scoredDate === day;
}

type Anchor = {
  ms: number;
  source: RestSourceKind;
  /**
   * True when a recorded finish sits an implausible distance from its own start
   * — bookkeeping rather than play. Projected rungs are derived FROM the start
   * and so are plausible by construction.
   */
  implausible?: boolean;
};

/**
 * Whether a recorded finish sits a plausible distance after a known start.
 *
 * **Deliberate divergence from `recoveryTimeline`**, which returns false when
 * there is no start at all. That module computes a *duration*, which is
 * meaningless without one. This computes a *finish anchor*, which is not: a
 * score entered from a draw view leaves neither a scheduledTime nor a
 * startTime, and its stamp is then the only evidence the match happened. With
 * nothing to contradict, there is nothing to reject.
 */
function isPlausibleFinish(finishMs: number, startMs: number | null): boolean {
  if (startMs === null) return true;
  const elapsed = finishMs - startMs;
  return elapsed > 0 && elapsed <= MAX_PLAUSIBLE_MATCH_MS;
}

/** The ladder, strongest first. Order is the contract; the row reports which rung won. */
const LADDER: { source: RestSourceKind; read: (times: NormalizedTimes) => number | null; projected: boolean }[] = [
  { source: 'endTime', read: (times) => times.endMs, projected: false },
  { source: 'scoredTime', read: (times) => times.scoredMs, projected: false },
  { source: 'startTime', read: (times) => times.startMs, projected: true },
  { source: 'calledAt', read: (times) => times.calledMs, projected: true },
  { source: 'scheduledTime', read: (times) => times.scheduledMs, projected: true },
];

/**
 * Every reading of when the participant coming out of `matchUp` became free,
 * strongest first. Projected rungs add `averageMinutes` because they mark a
 * start rather than a finish.
 *
 * All of them, not just the winner: whether a rung is usable depends on the
 * clock, which is the caller's to hold.
 */
export function resolveAnchors(times: NormalizedTimes, timing: SchedulingTiming): Anchor[] {
  const startReference = times.startMs ?? times.calledMs ?? times.scheduledMs;
  return LADDER.flatMap((rung) => {
    const ms = rung.read(times);
    if (ms === null) return [];
    if (rung.projected) return [{ ms: ms + timing.averageMinutes * MS_PER_MINUTE, source: rung.source }];
    const implausible = !isPlausibleFinish(ms, startReference);
    return [{ ms, source: rung.source, ...(implausible && { implausible: true }) }];
  });
}

/** The strongest available reading, ignoring whether it is usable. Correct for a live matchUp, whose finish IS ahead. */
function resolveAnchor(times: NormalizedTimes, timing: SchedulingTiming): Anchor | undefined {
  return resolveAnchors(times, timing).at(0);
}

/**
 * True when the matchUp is under way at `asOfMs` — started (or due) and not yet
 * finished.
 *
 * Deliberately **unbounded above**. Closing the window at
 * `start + averageMinutes` meant a match that ran long stopped counting as under
 * way while remaining unfinished, so it dropped out of the analysis and the
 * player read as having no match today — while standing on court. A match is
 * over when a result says so, not when the estimate expires.
 */
function isUnderWay(matchUp: HydratedMatchUp, times: NormalizedTimes, asOfMs: number): boolean {
  if (isFinished(matchUp)) return false;
  const start = times.startMs ?? times.calledMs ?? times.scheduledMs;
  return start !== null && start <= asOfMs;
}

/** Recovery owed after `prior`, accounting for a singles ↔ doubles change into `target`. */
function requirementFor(
  prior: HydratedMatchUp,
  target: HydratedMatchUp,
  timing: SchedulingTiming,
): { requiredMinutes: number; typeChange: boolean } {
  const changed = !!prior.matchUpType && !!target.matchUpType && prior.matchUpType !== target.matchUpType;
  const typeChangeMinutes = timing.typeChangeRecoveryMinutes ?? 0;
  if (changed && typeChangeMinutes > 0) return { requiredMinutes: typeChangeMinutes, typeChange: true };
  return { requiredMinutes: timing.recoveryMinutes, typeChange: false };
}

/** A same-day matchUp already under way or finished, resolved once and reused across participants. */
type PriorMatchUp = {
  matchUp: HydratedMatchUp;
  normalizedTimes: NormalizedTimes;
  timing: SchedulingTiming;
  underWay: boolean;
  individuals: Set<string>;
};

type RestContext = {
  matchUps: HydratedMatchUp[];
  timingFor: (matchUp: HydratedMatchUp) => SchedulingTiming;
  dailyLimits?: RestDailyLimits;
  scheduledDate: string;
  asOfMs: number;
  frame: Frame;
};

/**
 * The matchUps on the measured day that have already begun — finished or
 * currently under way. A match that has not started yet is not load the
 * director has already spent, so it is excluded; readiness reports those as
 * `overlap` / `dependency` instead.
 */
function collectPriorMatchUps(target: HydratedMatchUp, context: RestContext): PriorMatchUp[] {
  const results: PriorMatchUp[] = [];

  for (const matchUp of context.matchUps) {
    if (matchUp.matchUpId === target.matchUpId) continue;
    if (matchUp.matchUpStatus === BYE) continue;
    // A walkover is not load the director has spent — it neither tires a player
    // nor consumes a slot against the daily limit.
    if (!wasPlayed(matchUp)) continue;

    // Times are resolved before the day test because an undated matchUp is
    // dated by its `scoredTime`, which only exists in normalized form.
    const times = normalizeTimes(matchUp, context.frame);
    if (!occursOnDay(matchUp, times, context.scheduledDate)) continue;

    const timing = context.timingFor(matchUp);
    const underWay = isUnderWay(matchUp, times, context.asOfMs);
    if (!isFinished(matchUp) && !underWay) continue;
    results.push({
      individuals: new Set(individualIds(matchUp)),
      normalizedTimes: times,
      underWay,
      matchUp,
      timing,
    });
  }
  return results;
}

/** Daily load for one participant, and which configured limits the inspected matchUp would hit. */
function loadFor(prior: PriorMatchUp[], target: HydratedMatchUp, limits?: RestDailyLimits): RestDailyLoad {
  const singles = prior.filter((entry) => entry.matchUp.matchUpType === SINGLES_MATCHUP).length;
  const doubles = prior.filter((entry) => entry.matchUp.matchUpType === DOUBLES_MATCHUP).length;
  const total = prior.length;
  const ordinal = total + 1;

  const atLimit: ('singles' | 'doubles' | 'total')[] = [];
  let limit: number | undefined;

  if (limits?.total !== undefined && ordinal >= limits.total) {
    atLimit.push('total');
    limit = limits.total;
  }
  if (target.matchUpType === SINGLES_MATCHUP && limits?.SINGLES !== undefined && singles + 1 >= limits.SINGLES) {
    atLimit.push('singles');
    limit ??= limits.SINGLES;
  }
  if (target.matchUpType === DOUBLES_MATCHUP && limits?.DOUBLES !== undefined && doubles + 1 >= limits.DOUBLES) {
    atLimit.push('doubles');
    limit ??= limits.DOUBLES;
  }

  return { singles, doubles, total, ordinal, atLimit, limit };
}

type AnchoredPrior = {
  anchor: Anchor;
  matchUp: HydratedMatchUp;
  timing: SchedulingTiming;
  /** Rungs passed over on the way to `anchor`, strongest first. */
  discarded: RestSourceKind[];
};

/**
 * The rung one prior matchUp should be read from, and what was passed over.
 *
 * Two reasons to skip a rung, and they are different faults. **Implausible**:
 * the stamp sits more than a match's length from its own start, so it records
 * bookkeeping rather than play. **Ahead of now**: a finish that has not
 * happened, which is a projection on a matchUp recorded complete early.
 *
 * When nothing is readable the strongest *plausible* rung is still named, so the
 * row can point at the matchUp it failed to measure rather than at a stamp it
 * has already rejected.
 */
function selectAnchor(
  anchors: Anchor[],
  asOfMs: number,
): { anchor: Anchor; usable: boolean; discarded: RestSourceKind[] } | undefined {
  const readable = anchors.findIndex((anchor) => !anchor.implausible && anchor.ms <= asOfMs);
  if (readable >= 0) {
    return {
      anchor: anchors[readable],
      usable: true,
      discarded: anchors.slice(0, readable).map((anchor) => anchor.source),
    };
  }

  const plausible = anchors.findIndex((anchor) => !anchor.implausible);
  const index = plausible >= 0 ? plausible : 0;
  const anchor = anchors.at(index);
  return anchor && { anchor, usable: false, discarded: anchors.slice(0, index).map((entry) => entry.source) };
}

/**
 * The most recent usable anchor across a participant's prior matchUps — "the
 * last one that finished".
 *
 * Two selections, ordered differently on purpose. *Within* one matchUp the
 * ladder decides: the strongest rung at or before `asOf`, so a recorded finish
 * outranks a projection but a projection is still reached for when the recorded
 * value cannot be read. *Across* matchUps the clock decides: the latest of
 * those wins, because rest runs from the last time the player walked off.
 *
 * When every rung of every prior matchUp is in the future the matches still
 * happened, so reporting "no prior match" would fail open. The caller is handed
 * the earliest future anchor and told, via `unreliable`, that it cannot carry a
 * rest figure.
 */
function latestAnchor(prior: PriorMatchUp[], asOfMs: number): (AnchoredPrior & { unreliable: boolean }) | undefined {
  let past: AnchoredPrior | undefined;
  let future: AnchoredPrior | undefined;

  for (const entry of prior) {
    const selected = selectAnchor(resolveAnchors(entry.normalizedTimes, entry.timing), asOfMs);
    if (!selected) continue;
    const { anchor, usable, discarded } = selected;
    const candidate = { anchor, matchUp: entry.matchUp, timing: entry.timing, discarded };
    if (usable) {
      if (!past || anchor.ms > past.anchor.ms) past = candidate;
    } else if (!future || anchor.ms < future.anchor.ms) {
      future = candidate;
    }
  }

  if (past) return { ...past, unreliable: false };
  return future && { ...future, unreliable: true };
}

function onCourtRow(params: {
  participantId: string;
  participantName: string;
  live: PriorMatchUp;
  target: HydratedMatchUp;
  context: RestContext;
  load: RestDailyLoad;
}): RestRow {
  const { participantId, participantName, live, target, context, load } = params;
  const { requiredMinutes, typeChange } = requirementFor(live.matchUp, target, live.timing);
  const anchor = resolveAnchor(live.normalizedTimes, live.timing);
  // The anchor for a live matchUp is a *projected* finish. Once that projection
  // has passed, the match has overrun its format's average and the projection
  // has expired with it — naming a readyAt in the past would read as though the
  // player were already free, which is exactly backwards.
  const overrun = !!anchor && anchor.ms <= context.asOfMs;
  const readyAt =
    anchor && !overrun ? localClock(anchor.ms + requiredMinutes * MS_PER_MINUTE, context.frame) : undefined;
  return {
    participantId,
    participantName,
    status: 'onCourt',
    requiredMinutes,
    typeChange,
    ...(readyAt && { readyAt }),
    ...(overrun && { overrun: true }),
    ...(anchor && { source: anchor.source }),
    fromMatchUpId: live.matchUp.matchUpId,
    fromMatchUpLabel: matchUpLabel(live.matchUp),
    load,
  };
}

function restRowFor(
  participantId: string,
  target: HydratedMatchUp,
  context: RestContext,
  dayMatchUps: PriorMatchUp[],
): RestRow {
  const participantName = nameFor(participantId, context.matchUps);
  const prior = dayMatchUps.filter((entry) => entry.individuals.has(participantId));
  const load = loadFor(prior, target, context.dailyLimits);

  // Still on court dominates every other reading: rest has not started, so a
  // minutes figure would be a fiction. Report the projected finish instead.
  const live = prior.find((entry) => entry.underWay);
  if (live) return onCourtRow({ participantId, participantName, live, target, context, load });

  const latest = latestAnchor(prior, context.asOfMs);
  if (!latest) {
    return { participantId, participantName, status: 'none', requiredMinutes: 0, typeChange: false, load };
  }

  const { requiredMinutes, typeChange } = requirementFor(latest.matchUp, target, latest.timing);
  // An unreliable anchor sits in the future, so no interval can be measured
  // from it. Zero rest against a real requirement is the conservative reading —
  // it holds the player back — and `anchorUnreliable` keeps that from reading as
  // a measured figure.
  const restMinutes = latest.unreliable ? 0 : Math.floor((context.asOfMs - latest.anchor.ms) / MS_PER_MINUTE);
  const rested = !latest.unreliable && restMinutes >= requiredMinutes;
  const showReadyAt = !rested && !latest.unreliable;

  return {
    participantId,
    participantName,
    status: rested ? 'rested' : 'resting',
    restMinutes,
    requiredMinutes,
    typeChange,
    ...(showReadyAt && { readyAt: localClock(latest.anchor.ms + requiredMinutes * MS_PER_MINUTE, context.frame) }),
    ...(latest.unreliable && { anchorUnreliable: true }),
    ...(latest.discarded.length && { discardedSources: latest.discarded }),
    source: latest.anchor.source,
    fromMatchUpId: latest.matchUp.matchUpId,
    fromMatchUpLabel: matchUpLabel(latest.matchUp),
    load,
  };
}

/**
 * How far short of ready a row is, in minutes. The within-band tiebreak:
 * sorting by status alone left side order to decide which player the headline
 * spoke for, so a doubles pair resting at 10m and 40m reported whichever
 * happened to be listed first. `onCourt` and `none` carry no measurable
 * deficit, so they return 0 and keep their original order.
 */
function deficitMinutes(row: RestRow): number {
  if (row.status === 'onCourt' || row.status === 'none') return 0;
  return row.requiredMinutes - (row.restMinutes ?? 0);
}

/**
 * Rest for every individual in one matchUp. Rows are ordered worst-first
 * (`onCourt` → `resting` → `rested` → `none`) so a renderer can take the head as
 * the headline without re-deciding severity.
 *
 * Exported for callers that already hold hydrated matchUps and a resolver.
 */
export function analyzeParticipantRest(params: RestContext & { matchUpId: string }): RestResult {
  const { matchUpId, ...context } = params;
  const target = context.matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  if (!target) return { evaluated: false, reason: 'unknownMatchUp' };
  if (target.matchUpStatus === BYE) return { evaluated: false, reason: 'bye' };
  if (isFinished(target)) return { evaluated: false, reason: 'completed' };

  const participantIds = individualIds(target);
  if (!participantIds.length) return { evaluated: false, reason: 'noParticipants' };

  const dayMatchUps = collectPriorMatchUps(target, context);
  const order: RestStatus[] = ['onCourt', 'resting', 'rested', 'none'];
  const rows = participantIds
    .map((participantId) => restRowFor(participantId, target, context, dayMatchUps))
    .toSorted((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || deficitMinutes(b) - deficitMinutes(a));

  return {
    evaluated: true,
    asOf: new Date(context.asOfMs).toISOString(),
    scheduledDate: context.scheduledDate,
    rows,
  };
}

type GetParticipantRestArgs = {
  tournamentRecord: Tournament;
  /** Hydrated `{ inContext: true }`. Resolved from the record when absent. */
  matchUps?: HydratedMatchUp[];
  matchUpId: string;
  /**
   * The instant the analysis is "as of", ISO. **Required — the factory holds no
   * clock.** The same caller-supplied wall-clock idiom as `calledAt` and
   * `ScheduleScenario.createdAt`.
   */
  asOf: string;
  /**
   * The day rest is measured on. Defaults to the inspected matchUp's own
   * `scheduledDate`, which cannot drift from the thing being asked about; the
   * parameter exists for an unscheduled matchUp, which has no day of its own.
   */
  scheduledDate?: string;
  /** Fixed offset east of UTC. Ignored when `timeZone` is supplied. */
  utcOffsetMinutes?: number;
  /** IANA zone. Defaults to the tournament's `localTimeZone`; DST-correct, which an offset cannot be. */
  timeZone?: string;
};

export function getParticipantRest(params: GetParticipantRestArgs): ResultType & { rest?: RestResult } {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true, matchUpId: true }]);
  if (paramsCheck.error) return paramsCheck;
  if (!params.matchUpId) return { error: MISSING_MATCHUP_ID };

  const { tournamentRecord, matchUpId, asOf, utcOffsetMinutes = 0 } = params;
  const asOfMs = isoToMs(asOf);
  // Without an instant there is nothing to measure from, and substituting one
  // would be the factory reading a clock it does not have.
  if (asOfMs === null) return { rest: { evaluated: false, reason: 'noAsOf' } };

  const matchUps =
    params.matchUps ??
    ((allTournamentMatchUps({ tournamentRecord, inContext: true })?.matchUps ?? []) as HydratedMatchUp[]);

  const target = matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  if (!target) return { rest: { evaluated: false, reason: 'unknownMatchUp' } };

  // Rest is scoped to a day, and an unscheduled matchUp has none of its own. The
  // caller names one — that is what a catalog card is asking about — and saying
  // so beats measuring against a day nobody chose.
  const scheduledDate = params.scheduledDate ?? target.schedule?.scheduledDate;
  if (!scheduledDate) return { rest: { evaluated: false, reason: 'noDay' } };

  const limits: any = getDailyLimit({ tournamentRecord });

  const rest = analyzeParticipantRest({
    frame: { utcOffsetMinutes, timeZone: params.timeZone ?? (tournamentRecord as any)?.localTimeZone },
    timingFor: makeTimingResolver(tournamentRecord),
    dailyLimits: limits?.error ? undefined : limits?.matchUpDailyLimits,
    scheduledDate,
    matchUpId,
    matchUps,
    asOfMs,
  });

  return { rest };
}
