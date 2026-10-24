import {
  getCapturedClock,
  getCapturedCompetitionClock,
  setCapturedClock,
  setCapturedCompetitionClock,
  setCapturedStamps,
} from '@Global/state/globalState';

// constants
import { ErrorType, INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * The engine's clock, process-wide.
 *
 * A mutation that stamps "now" into a record (`schedule.scoredTime` on the first score,
 * `timeItem.createdAt`, `extension.createdAt`, a draft's `resolvedAt`, a point's `timestamp`, …)
 * reads it from here, so a run can be made reproducible and a golden corpus can be regenerated
 * byte-for-byte. Default is the wall clock; `setClock()` with no argument restores it.
 *
 * Accepts a fixed instant (ISO string or epoch milliseconds) or a function returning one, so a
 * test can freeze time or advance it deliberately. Elapsed-time measurement and logging never
 * route through here. Record stamps do, and so do some reads that compare against "now"
 * (mutation-lock expiry, publication windows, report generatedAt); those are not writes.
 *
 * Process-wide on purpose, like `schemaWriteMode`: it is a run configuration, not request state.
 *
 * ONE INSTANT PER ENGINE CALL. An engine entry point (invoke, executionQueue, their async twins, ask,
 * dry run, the mocks and declaration engines) captures the source ONCE, before any method runs, via
 * `withCapturedClock`. Every `now()` inside that call, nested engine calls and the notification
 * timeStamp included, returns that instant. A source that throws or returns an invalid instant is
 * refused there, as `{ error: INVALID_DATE }`, before anything is written.
 *
 * The captured instant lives in the global state provider (`getCapturedClock`/`setCapturedClock`),
 * so an async provider scopes it per request. An async provider without those optional hooks
 * captures nothing: nested reads then go to the source each time, as they did before capture.
 *
 * Outside an engine call (a governor or helper called directly) there is nothing to capture into:
 * every `now()` reads the source, and an invalid source THROWS. It used to fall back to the wall
 * clock silently, which stamped a record with a time nobody configured.
 */
type ClockSource = () => Date | string | number;

type ClockError = { error: ErrorType; message: string };

let configuredClock: ClockSource | undefined;

// always a NEW Date: neither a caller's Date nor one handed out by `now()` is ever shared with the clock
function toDate(value: Date | string | number): Date | undefined {
  const date = new Date(value instanceof Date ? value.getTime() : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function setClock(clock?: ClockSource | Date | string | number): { success?: boolean; error?: ErrorType } {
  if (clock === undefined) {
    configuredClock = undefined;
    return { ...SUCCESS };
  }
  if (typeof clock === 'function') {
    configuredClock = clock;
    return { ...SUCCESS };
  }
  if (typeof clock !== 'string' && typeof clock !== 'number' && !(clock instanceof Date)) {
    return { error: INVALID_VALUES };
  }
  const fixed = toDate(clock)?.getTime();
  if (fixed === undefined) return { error: INVALID_DATE };
  // a fixed instant is kept as epoch ms, so mutating the Date that configured it cannot move it
  configuredClock = () => fixed;
  return { ...SUCCESS };
}

// One validated read of the source. Never throws: a throwing or invalid source becomes a ClockError.
function readSource(): { ms: number } | ClockError {
  if (!configuredClock) return { ms: Date.now() };
  let date: Date | undefined;
  try {
    date = toDate(configuredClock());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { error: INVALID_DATE, message: `the configured clock threw: ${reason}` };
  }
  if (!date) return { error: INVALID_DATE, message: 'the configured clock returned an invalid instant' };
  return { ms: date.getTime() };
}

/**
 * Competition time — "now" at the competition, for the reads that DECIDE something against it
 * (live duration, embargoes, publication windows, "today" for eligibility), as opposed to the
 * stamps written into records above. Slice 0-d.1 of Mentat/planning/COMPETITION_CLOCK_INSTRUMENTATION.md.
 *
 * With no provider installed (the default, and every run today) competition time IS record time:
 * `competitionNow()` returns exactly what `now()` returns, captured instant included. A host that
 * installs one with `setCompetitionClock({ nowMs })` moves only the competition reads; record stamps
 * stay on `setClock`. A demo binds both to one source. The two disagreeing in a live mutation
 * session is not supported (see the plan's activation gate).
 *
 * Synchronous and numeric on purpose: the plan's provider contract is `{ nowMs(): number }`, so a
 * Temporal migration changes nothing here.
 */
export type CompetitionTimeProvider = { nowMs(): number };

let competitionProvider: CompetitionTimeProvider | undefined;

export function setCompetitionClock(provider?: CompetitionTimeProvider): { success?: boolean; error?: ErrorType } {
  if (provider === undefined) {
    competitionProvider = undefined;
    return { ...SUCCESS };
  }
  if (typeof provider?.nowMs !== 'function') return { error: INVALID_VALUES };
  competitionProvider = provider;
  return { ...SUCCESS };
}

// One validated read of the installed competition provider. Never throws.
function readCompetition(provider: CompetitionTimeProvider): { ms: number } | ClockError {
  let ms: unknown;
  try {
    ms = provider.nowMs();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { error: INVALID_DATE, message: `the competition clock threw: ${reason}` };
  }
  // representable, not just finite: Date holds ±8.64e15 ms, and 1e20 passed a finiteness check, let a
  // mutation succeed, then threw on the first toISOString()
  if (typeof ms !== 'number' || Number.isNaN(new Date(ms).getTime())) {
    return { error: INVALID_DATE, message: 'the competition clock returned an invalid instant' };
  }
  return { ms };
}

/**
 * Read and validate every configured source ONCE, and hold the instants for the call: record time
 * always, competition time when a provider is installed. `release` restores "nothing captured".
 */
function beginCapture(): { timeStamp: number; release: () => void } | ClockError {
  const record = readSource();
  if ('error' in record) return record;
  const competition = competitionProvider && readCompetition(competitionProvider);
  if (competition && 'error' in competition) return competition;

  setCapturedClock(record.ms);
  if (competition) setCapturedCompetitionClock(competition.ms);
  // the call's stamp ledger opens and closes with its instant: an entity is stamped once per call
  setCapturedStamps(new WeakSet());
  return {
    timeStamp: record.ms,
    release: () => {
      setCapturedClock(undefined);
      setCapturedCompetitionClock(undefined);
      setCapturedStamps(undefined);
    },
  };
}

/**
 * Run `fn` at one captured instant, passed to it as `timeStamp`. Nested calls reuse the outer
 * instant; the outermost call restores "nothing captured" when `fn` returns or throws. A source
 * that cannot produce a valid instant is refused before `fn` runs, and so is an installed
 * competition provider that cannot.
 */
export function withCapturedClock<T>(fn: (timeStamp: number) => T): T | ClockError {
  const captured = getCapturedClock();
  if (captured !== undefined) return fn(captured);

  const capture = beginCapture();
  if ('error' in capture) return capture;
  try {
    return fn(capture.timeStamp);
  } finally {
    capture.release();
  }
}

/** `withCapturedClock` for an async `fn`: the capture is released only once `fn` settles. */
export async function withCapturedClockAsync<T>(fn: (timeStamp: number) => Promise<T>): Promise<T | ClockError> {
  const captured = getCapturedClock();
  if (captured !== undefined) return fn(captured);

  const capture = beginCapture();
  if ('error' in capture) return capture;
  try {
    return await fn(capture.timeStamp);
  } finally {
    capture.release();
  }
}

/** The current instant as a Date: the captured one inside an engine call, else read at the call. */
export function now(): Date {
  const captured = getCapturedClock();
  if (captured !== undefined) return new Date(captured);

  const read = readSource();
  if ('error' in read) throw new Error(read.message);
  return new Date(read.ms);
}

/** The current instant as an ISO 8601 string, the form every record timestamp takes. */
export function nowIso(): string {
  return now().toISOString();
}

/** The current instant as epoch milliseconds, for sites that compare or bump timestamps. */
export function nowMs(): number {
  return now().getTime();
}

/**
 * "Now" at the competition: the instant captured for the engine call when a competition provider is
 * installed, else the provider read at the call, else exactly `now()`. Outside an engine call, a
 * provider that cannot produce a valid instant throws, as `now()` does for its own source.
 */
export function competitionNow(): Date {
  const captured = getCapturedCompetitionClock();
  if (captured !== undefined) return new Date(captured);
  if (!competitionProvider) return now();

  const read = readCompetition(competitionProvider);
  if ('error' in read) throw new Error(read.message);
  return new Date(read.ms);
}

/** Competition time as epoch milliseconds, for comparisons. */
export function competitionNowMs(): number {
  return competitionNow().getTime();
}
