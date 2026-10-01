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
 * test can freeze time or advance it deliberately. Timing and notification timestamps that never
 * reach a stored record are NOT routed through here; only writes into records are.
 *
 * Process-wide on purpose, like `schemaWriteMode`: it is a run configuration, not request state.
 */
type ClockSource = () => Date | string | number;

let configuredClock: ClockSource | undefined;

function toDate(value: Date | string | number): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
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
  const fixed = toDate(clock);
  if (!fixed) return { error: INVALID_DATE };
  configuredClock = () => fixed;
  return { ...SUCCESS };
}

/** The current instant as a Date. Read at the call, never captured at import. */
export function now(): Date {
  if (!configuredClock) return new Date();
  return toDate(configuredClock()) ?? new Date();
}

/** The current instant as an ISO 8601 string, the form every record timestamp takes. */
export function nowIso(): string {
  return now().toISOString();
}

/** The current instant as epoch milliseconds, for sites that compare or bump timestamps. */
export function nowMs(): number {
  return now().getTime();
}
