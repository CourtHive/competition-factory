/**
 * Readiness for one scheduled matchUp — *can this placement happen at the time
 * it is scheduled for?*
 *
 * Four things can be wrong with a placement, and the answer names which:
 *
 *   - `overlap`      — a participant is due on court in another matchUp whose
 *                      window contains this start time
 *   - `recovery`     — a participant's recovery window has not elapsed
 *   - `dependency`   — an upstream matchUp is not finished, or not even
 *                      scheduled, so this one cannot start on time
 *   - `undetermined` — a side has no participant yet, and something upstream
 *                      explains why
 *
 * ── Provenance ──
 *
 * Ported from TMX, which built it behind an adapter (`ReadinessInput` →
 * `ReadinessResult`) precisely so this move would be a body swap rather than a
 * rewrite; its module header named `getMatchUpReadiness` as the destination.
 * The `ReadinessResult` payload shape is preserved exactly, so the consumer
 * change is an import.
 *
 * What changes in the move is where the *inputs* come from. TMX injected the
 * hydrated matchUps and a `timingFor` callback because a client cannot reach
 * the engine from a pure module; here both are resolved internally, which is
 * the point of the relocation — one resolution of what a format costs, shared
 * with `getParticipantRest`, rather than one per consumer.
 *
 * ── Deliberately NOT the same question as `getParticipantRest` ──
 *
 * Readiness is anchored on the target's own `scheduledTime` and skips entirely
 * when there is not one. Rest is anchored on a caller-supplied *now*, so it
 * answers for a matchUp still sitting in a catalog. Both are needed; neither
 * subsumes the other.
 *
 * ── Clock-free ──
 *
 * Every comparison here is between two venue wall clocks on the same day, so
 * the browser's zone cancels on both sides and no instant is ever converted.
 * That is what lets this run in the factory unchanged.
 */
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { makeTimingResolver, SchedulingTiming } from './schedulingTiming';

// constants and types
import { MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';
import { BYE } from '@Constants/matchUpStatusConstants';

export type ReadinessKind = 'undetermined' | 'dependency' | 'recovery' | 'overlap';
export type ReadinessSeverity = 'WARN' | 'INFO';

export type ReadinessFinding = {
  kind: ReadinessKind;
  severity: ReadinessSeverity;
  participantIds?: string[];
  participantNames?: string[];
  matchUpIds?: string[];
  matchUpLabels?: string[];
  /** Earliest clock time the blocker clears, `HH:MM`. Absent when it cannot be projected. */
  notBefore?: string;
};

/** Why readiness could not be evaluated. Never reported as "ready" — an unevaluated matchUp is not a clean one. */
export type ReadinessSkipReason = 'unknownMatchUp' | 'bye' | 'completed' | 'notScheduled' | 'noTime';

export type ReadinessResult =
  { evaluated: false; reason: ReadinessSkipReason } | { evaluated: true; findings: ReadinessFinding[] };

const COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'RETIRED',
  'WALKOVER',
  'DEFAULTED',
  'DOUBLE_WALKOVER',
  'DOUBLE_DEFAULT',
  'ABANDONED',
]);

/** True when a matchUp has a result and can no longer block anything. */
export function isFinished(matchUp: HydratedMatchUp): boolean {
  return !!matchUp.winningSide || (!!matchUp.matchUpStatus && COMPLETED_STATUSES.has(matchUp.matchUpStatus));
}

/** `'09:30'` → `570`. `null` for anything that is not a readable wall clock. */
export function parseClockMinutes(value?: string): number | null {
  if (!value) return null;
  const matched = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!matched) return null;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** `540` → `'09:00'`. Wraps past midnight rather than producing `25:xx`. */
export function minutesToClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/** Individual participantIds on a matchUp — expands doubles/team sides to their members. */
export function individualIds(matchUp: HydratedMatchUp): string[] {
  const ids = new Set<string>();
  for (const side of matchUp.sides ?? []) {
    for (const id of side.participant?.individualParticipantIds ?? []) ids.add(id);
    const sideId = side.participantId ?? side.participant?.participantId;
    // A side's own participantId substitutes for its members only when the
    // members are unknown — otherwise a pair is counted twice, as itself and as
    // its players, and never matches the individuals on another side.
    if (sideId && !side.participant?.individualParticipantIds?.length) ids.add(sideId);
  }
  return [...ids];
}

function sideLabel(side: any): string {
  return side?.participant?.participantName ?? side?.participantName ?? 'TBD';
}

/** "R16: Alice vs Bob" — the label vocabulary the schedule surfaces already use. */
export function matchUpLabel(matchUp: HydratedMatchUp): string {
  const names = (matchUp.sides ?? []).map(sideLabel);
  const players = names.length ? names.join(' vs ') : 'TBD vs TBD';
  return matchUp.roundName ? `${matchUp.roundName}: ${players}` : players;
}

/** Name for a participantId, taken from whichever matchUp side carries it. */
export function nameFor(participantId: string, matchUps: HydratedMatchUp[]): string {
  for (const matchUp of matchUps) {
    for (const side of matchUp.sides ?? []) {
      if ((side.participantId ?? side.participant?.participantId) === participantId) return sideLabel(side);
      if (side.participant?.individualParticipantIds?.includes(participantId)) return sideLabel(side);
    }
  }
  return participantId;
}

/** Direct upstream feeders, inverted from the forward `winner` / `loser` edges. */
function buildFeederMap(matchUps: HydratedMatchUp[]): Map<string, string[]> {
  const feeders = new Map<string, string[]>();
  const push = (target: string | undefined, source: string) => {
    if (!target) return;
    const list = feeders.get(target);
    if (list) list.push(source);
    else feeders.set(target, [source]);
  };
  for (const matchUp of matchUps) {
    push(matchUp.winnerMatchUpId, matchUp.matchUpId);
    push(matchUp.loserMatchUpId, matchUp.matchUpId);
  }
  return feeders;
}

/**
 * Every incomplete matchUp upstream of `matchUpId`, transitively. A grandparent
 * that has not been played blocks just as surely as a parent, and the walk stops
 * at finished matchUps because nothing behind them can still be pending.
 */
function incompleteUpstream(
  matchUpId: string,
  feeders: Map<string, string[]>,
  byId: Map<string, HydratedMatchUp>,
): HydratedMatchUp[] {
  const found: HydratedMatchUp[] = [];
  const seen = new Set<string>([matchUpId]);
  const queue = [...(feeders.get(matchUpId) ?? [])];

  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const matchUp = byId.get(id);
    if (!matchUp) continue;
    if (isFinished(matchUp)) continue;
    if (matchUp.matchUpStatus === BYE) continue;
    found.push(matchUp);
    queue.push(...(feeders.get(id) ?? []));
  }
  return found;
}

/** When an incomplete matchUp is projected to finish, in minutes. `null` when it cannot be projected. */
function projectedFinish(matchUp: HydratedMatchUp, timing: SchedulingTiming): number | null {
  const start = parseClockMinutes(matchUp.schedule?.scheduledTime);
  if (start === null) return null;
  return start + timing.averageMinutes;
}

/** When a participant coming out of `matchUp` is next available, in minutes. `null` when unprojectable. */
function freeAfter(matchUp: HydratedMatchUp, timing: SchedulingTiming): number | null {
  const end = parseClockMinutes(matchUp.schedule?.endTime);
  if (end !== null) return end + timing.recoveryMinutes;
  const start = parseClockMinutes(matchUp.schedule?.scheduledTime);
  if (start === null) return null;
  return start + timing.averageMinutes + timing.recoveryMinutes;
}

/** Why the target cannot be evaluated, or undefined when it can. */
function skipReasonFor(target: HydratedMatchUp): ReadinessSkipReason | undefined {
  if (target.matchUpStatus === BYE) return 'bye';
  if (isFinished(target)) return 'completed';
  if (!target.schedule?.scheduledDate) return 'notScheduled';
  if (parseClockMinutes(target.schedule?.scheduledTime) === null) return 'noTime';
  return undefined;
}

function undeterminedFinding(target: HydratedMatchUp, upstream: HydratedMatchUp[]): ReadinessFinding | undefined {
  const hasUnknownSide = (target.sides ?? []).some((side) => !(side.participantId ?? side.participant?.participantId));
  if (!hasUnknownSide || !upstream.length) return undefined;
  return {
    kind: 'undetermined',
    severity: 'INFO',
    matchUpIds: upstream.map((matchUp) => matchUp.matchUpId),
    matchUpLabels: upstream.map(matchUpLabel),
  };
}

type TimingFor = (matchUp: HydratedMatchUp) => SchedulingTiming;

function dependencyFindings(
  upstream: HydratedMatchUp[],
  startMinutes: number,
  timingFor: TimingFor,
): ReadinessFinding[] {
  return upstream.flatMap((source) => {
    const finish = projectedFinish(source, timingFor(source));
    const base = {
      kind: 'dependency' as const,
      severity: 'WARN' as const,
      matchUpIds: [source.matchUpId],
      matchUpLabels: [matchUpLabel(source)],
    };
    // Unscheduled upstream: cannot be projected, and therefore cannot be
    // promised to finish in time — reported without a `notBefore`.
    if (finish === null) return [base];
    if (finish > startMinutes) return [{ ...base, notBefore: minutesToClock(finish) }];
    return [];
  });
}

type ParticipantClash = {
  participantId: string;
  participantName: string;
  matchUp: HydratedMatchUp;
  notBefore?: string;
};

/** Other same-day matchUps that share an individual with the target. */
function sameDayNeighbours(target: HydratedMatchUp, matchUps: HydratedMatchUp[]): HydratedMatchUp[] {
  const date = target.schedule?.scheduledDate;
  const targetIndividuals = new Set(individualIds(target));
  if (!targetIndividuals.size) return [];
  return matchUps.filter((matchUp) => {
    if (matchUp.matchUpId === target.matchUpId) return false;
    if (matchUp.matchUpStatus === BYE) return false;
    if (matchUp.schedule?.scheduledDate !== date) return false;
    return individualIds(matchUp).some((id) => targetIndividuals.has(id));
  });
}

/** Shared individuals between two matchUps, as clash rows. */
function clashesBetween(
  target: HydratedMatchUp,
  neighbour: HydratedMatchUp,
  matchUps: HydratedMatchUp[],
): ParticipantClash[] {
  const targetIndividuals = new Set(individualIds(target));
  return individualIds(neighbour)
    .filter((id) => targetIndividuals.has(id))
    .map((participantId) => ({
      participantId,
      participantName: nameFor(participantId, matchUps),
      matchUp: neighbour,
    }));
}

function toFinding(kind: ReadinessKind, clashes: ParticipantClash[]): ReadinessFinding {
  const notBefore = clashes.map((clash) => clash.notBefore).find(Boolean);
  return {
    kind,
    severity: 'WARN',
    participantIds: clashes.map((clash) => clash.participantId),
    participantNames: [...new Set(clashes.map((clash) => clash.participantName))],
    matchUpIds: [...new Set(clashes.map((clash) => clash.matchUp.matchUpId))],
    matchUpLabels: [...new Set(clashes.map((clash) => matchUpLabel(clash.matchUp)))],
    ...(notBefore && { notBefore }),
  };
}

/**
 * Overlap and recovery in one pass, because they are the same question asked at
 * two strengths and must not both fire for one participant: overlap means the
 * participant is *on court elsewhere* at this start time, which already implies
 * the recovery window is violated.
 */
function clashFindings(
  target: HydratedMatchUp,
  startMinutes: number,
  matchUps: HydratedMatchUp[],
  timingFor: TimingFor,
): ReadinessFinding[] {
  const overlapping: ParticipantClash[] = [];
  const recovering: ParticipantClash[] = [];
  const overlappedIds = new Set<string>();

  for (const neighbour of sameDayNeighbours(target, matchUps)) {
    const timing = timingFor(neighbour);
    const neighbourStart = parseClockMinutes(neighbour.schedule?.scheduledTime);
    const clashes = clashesBetween(target, neighbour, matchUps);
    if (!clashes.length) continue;

    const isOverlap =
      !isFinished(neighbour) &&
      neighbourStart !== null &&
      neighbourStart <= startMinutes &&
      startMinutes < neighbourStart + Math.max(timing.averageMinutes, 1);

    if (isOverlap) {
      overlapping.push(...clashes);
      for (const clash of clashes) overlappedIds.add(clash.participantId);
      continue;
    }

    const free = freeAfter(neighbour, timing);
    if (free === null || free <= startMinutes) continue;
    recovering.push(...clashes.map((clash) => ({ ...clash, notBefore: minutesToClock(free) })));
  }

  const stillRecovering = recovering.filter((clash) => !overlappedIds.has(clash.participantId));
  const findings: ReadinessFinding[] = [];
  if (overlapping.length) findings.push(toFinding('overlap', overlapping));
  if (stillRecovering.length) findings.push(toFinding('recovery', stillRecovering));
  return findings;
}

/**
 * Findings ordered strongest-first (`overlap` → `dependency` → `recovery` →
 * `undetermined`) so a renderer can take the head as the headline without
 * re-deciding severity.
 *
 * Exported for callers that already hold hydrated matchUps and a timing
 * resolver — `getParticipantRest` and the query below both do — so neither pays
 * twice for the same hydration.
 */
export function analyzeMatchUpReadiness(params: {
  matchUps: HydratedMatchUp[];
  timingFor: TimingFor;
  matchUpId: string;
}): ReadinessResult {
  const { matchUps, timingFor, matchUpId } = params;
  const byId = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const target = byId.get(matchUpId);
  if (!target) return { evaluated: false, reason: 'unknownMatchUp' };

  const reason = skipReasonFor(target);
  if (reason) return { evaluated: false, reason };

  const startMinutes = parseClockMinutes(target.schedule?.scheduledTime) as number;
  const upstream = incompleteUpstream(target.matchUpId, buildFeederMap(matchUps), byId);

  const findings: ReadinessFinding[] = [
    ...clashFindings(target, startMinutes, matchUps, timingFor),
    ...dependencyFindings(upstream, startMinutes, timingFor),
  ];

  const undetermined = undeterminedFinding(target, upstream);
  if (undetermined) findings.push(undetermined);

  const order: ReadinessKind[] = ['overlap', 'dependency', 'recovery', 'undetermined'];
  return { evaluated: true, findings: findings.toSorted((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)) };
}

type GetMatchUpReadinessArgs = {
  tournamentRecord: Tournament;
  /** Hydrated `{ inContext: true, nextMatchUps: true }`. Resolved from the record when absent. */
  matchUps?: HydratedMatchUp[];
  matchUpId: string;
};

export function getMatchUpReadiness(params: GetMatchUpReadinessArgs): ResultType & { readiness?: ReadinessResult } {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true, matchUpId: true }]);
  if (paramsCheck.error) return paramsCheck;
  if (!params.matchUpId) return { error: MISSING_MATCHUP_ID };

  const { tournamentRecord, matchUpId } = params;
  // `nextMatchUps` carries the forward edges the feeder map is inverted from;
  // without it every dependency finding silently disappears.
  const matchUps =
    params.matchUps ??
    (allTournamentMatchUps({ tournamentRecord, inContext: true, nextMatchUps: true })?.matchUps as HydratedMatchUp[]);

  const readiness = analyzeMatchUpReadiness({
    timingFor: makeTimingResolver(tournamentRecord),
    matchUps: matchUps ?? [],
    matchUpId,
  });

  return { readiness };
}
