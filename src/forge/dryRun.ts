/**
 * `dryRun(engine, directives)` — preview an `executionQueue` without
 * committing.
 *
 * Same machinery as the real `executionQueue` (per-tournament snapshot via
 * `makeDeepCopy`, sequential method dispatch via `executeFunction`) but
 * with two contract differences:
 *
 *   1. **State is always restored** at the end — both on success and on
 *      error. Callers never see persisted side effects.
 *   2. **Subscribers are NOT notified.** The notices accumulated by the
 *      methods are captured into `willEmitNotices` and then drained from
 *      the buffer so the next real call starts clean. A consumer that
 *      wants to know "what would have fired" inspects the returned
 *      `willEmitNotices` array.
 *
 * Returns the RFC 6902 JSON patch between the pre-state and the would-be
 * post-state, plus the per-method results and what topics/payloads the
 * run would emit. Surfaces as `engine.dryRun(directives)` via
 * `engineStart`.
 *
 *   const { wouldSucceed, patch, willEmitNotices } = engine.dryRun([
 *     { method: 'deleteDrawDefinition', params: { drawId } },
 *   ]);
 *
 *   if (wouldSucceed) {
 *     console.log(`Would change ${patch.length} fields`);
 *   } else {
 *     showWarning(`Cannot delete: ${patch.length === 0 ? 'no changes' : '...'}`);
 *   }
 *
 * Perf: one `makeDeepCopy` of tournamentRecords up front (the same cost
 * `rollbackOnError` already pays), one diff walk over the post-state at
 * the end. For typical state sizes this is sub-10 ms; for very large
 * (50+ events, full draws) it's 50–200 ms. Safe for dev/preflight callers,
 * not for hot paths — for hot-path gating use `explain` instead.
 */
import { deleteNotices, getNotices, getTopics, getTournamentRecords } from '@Global/state/globalState';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { setState } from '@Assemblies/engines/parts/stateMethods';
import { getMethods } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { generatePatch, type JsonPatch } from './jsonPatch';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Directives, FactoryEngine } from '@Types/factoryTypes';

export type EmittedNotice = {
  topic: string;
  payloads: unknown[];
};

export type DryRunResult = {
  wouldSucceed: boolean;
  /** Per-method results (same shape `executionQueue` returns). */
  results: any[];
  /** RFC 6902 patch from pre-state to would-be post-state. */
  patch: JsonPatch;
  /** Topics + payloads the real call would have emitted to subscribers. */
  willEmitNotices: EmittedNotice[];
  /** Set when a directive's method dispatch returned `{ error }`. */
  error?: any;
  /** True when state was restored — always true in dryRun. */
  rolledBack: true;
};

export function dryRun(engine: FactoryEngine, directives: Directives): DryRunResult {
  if (!Array.isArray(directives)) {
    return {
      wouldSucceed: false,
      results: [],
      patch: [],
      willEmitNotices: [],
      error: { ...INVALID_VALUES, message: 'directives must be an array' },
      rolledBack: true,
    };
  }

  const methods = getMethods();

  // Snapshot BEFORE any method runs. Independent deep copies so we can
  // diff `snapshot` against the post-state without aliasing surprises.
  const snapshot = makeDeepCopy(getTournamentRecords(), false, true);

  const results: any[] = [];
  let error: any = undefined;

  for (const directive of directives) {
    if (typeof directive !== 'object') {
      error = { ...INVALID_VALUES, message: 'directive must be an object' };
      break;
    }
    if (directive.params && typeof directive.params !== 'object') {
      error = { ...INVALID_VALUES, message: 'params must be an object' };
      break;
    }

    const { method: methodName, pipe } = directive;
    const params = directive.params ? { ...directive.params } : {};

    if (!methods[methodName]) {
      error = { ...INVALID_VALUES, message: `method '${methodName}' not found` };
      break;
    }

    if (pipe) {
      const lastResult = results.at(-1);
      const pipeKeys = Object.keys(pipe);
      for (const pipeKey of pipeKeys) {
        if (lastResult?.[pipeKey]) params[pipeKey] = lastResult[pipeKey];
      }
    }

    const result = executeFunction(engine, methods[methodName], params, methodName, 'sync');
    results.push({ ...result, methodName });

    if (result?.error) {
      error = result.error;
      break;
    }
  }

  // Capture the would-be post-state BEFORE restoring; diff snapshot vs. it.
  // The post-snapshot must also be a deep copy so the cached `tournamentRecords`
  // reference isn't shared with `snapshot` once we call `setState(snapshot)`.
  const postState = makeDeepCopy(getTournamentRecords(), false, true);
  const patch = generatePatch(snapshot, postState);

  // Drain the notices buffer the methods accumulated. Capture per-topic
  // payloads first, then `deleteNotices()` so the next real call starts
  // clean. We do NOT call `notifySubscribers` — the whole point of dryRun
  // is "what WOULD fire", not "fire it".
  const willEmitNotices: EmittedNotice[] = [];
  const { topics } = getTopics();
  for (const topic of topics) {
    const payloads = getNotices({ topic });
    if (payloads?.length) willEmitNotices.push({ topic, payloads });
  }
  deleteNotices();

  // Restore the snapshot. Always — dryRun's contract is "never persist".
  setState(snapshot);

  return {
    wouldSucceed: !error,
    results,
    patch,
    willEmitNotices,
    ...(error ? { error } : {}),
    rolledBack: true,
  };
}
