/**
 * SETTLE TELEMETRY: what v1's settle passes cannot report through a result (outcome v2 executor plan § 2.7, § 5 Phase C).
 *
 * Six bounded loops stop at a bound, three of them silently, and one pass drops the error of the write it makes. Before
 * F9 (CA 2026-10-19: a planned refusal at every bound) and the "no swallowed errors" prerequisite can be decided, the
 * census must say whether any of these is reachable: this records each, and the census harness reports it.
 *
 * Inert unless enabled: production never enables it, and a disabled `record` is one boolean test. Enabled by the
 * census harness around each step it observes; module state, because the harness is single-threaded.
 */
export type SettleEvent = {
  kind: 'bound' | 'dropped-error';
  /** the loop or pass */
  site: string;
  detail?: string;
};

const telemetry = { enabled: false, events: [] as SettleEvent[] };

export function enableSettleTelemetry(enabled = true) {
  telemetry.enabled = enabled;
  telemetry.events.length = 0;
}

export function recordSettleEvent(event: SettleEvent) {
  if (telemetry.enabled) telemetry.events.push(event);
}

/** the events recorded since the last take, and clear them */
export function takeSettleEvents(): SettleEvent[] {
  return telemetry.events.splice(0);
}
