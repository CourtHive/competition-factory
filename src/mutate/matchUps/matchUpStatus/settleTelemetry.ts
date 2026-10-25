import { generatePatch } from '../../../forge/jsonPatch';
import { captureRecord } from '@Tools/recordDiff';

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
  /** `predicted`: v2's has-work predicate for a pass, recorded before v1's passes run (`outcome/settleWork.ts`) */
  kind: 'bound' | 'dropped-error' | 'wrote' | 'predicted';
  /** the loop or pass */
  site: string;
  detail?: string;
};

const telemetry = { enabled: false, passes: false, events: [] as SettleEvent[] };

/** `passes` also records each settle pass's writes (`observePass`): two record captures per pass, so opt-in */
export function enableSettleTelemetry(enabled = true, { passes = false }: { passes?: boolean } = {}) {
  telemetry.enabled = enabled;
  telemetry.passes = enabled && passes;
  telemetry.events.length = 0;
}

export function recordSettleEvent(event: SettleEvent) {
  if (telemetry.enabled) telemetry.events.push(event);
}

/** the events recorded since the last take, and clear them */
export function takeSettleEvents(): SettleEvent[] {
  return telemetry.events.splice(0);
}

/**
 * PER-PASS WRITE REPORTS (Phase C prerequisite 1): run a settle pass, and when telemetry is enabled, record that it
 * wrote and how many JSON paths of the draw it changed. The executor's per-pass tally compares "v2 predicted no work"
 * with this. Disabled, the pass runs and nothing is read: production pays one boolean test.
 */
export function observePass<T>(site: string, drawDefinition: unknown, pass: () => T): T {
  if (!telemetry.passes || !drawDefinition) return pass();
  const before = captureRecord(drawDefinition);
  const result = pass();
  const after = captureRecord(drawDefinition);
  if (after !== before) {
    const changed = generatePatch(JSON.parse(before), JSON.parse(after)).length;
    telemetry.events.push({ kind: 'wrote', site, detail: `${changed} paths` });
  }
  return result;
}
