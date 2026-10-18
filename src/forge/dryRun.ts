/**
 * `dryRun(engine, directives)` — preview an `executionQueue` without
 * committing.
 *
 * The same validation, directive preparation (the `nonRandom` seed, pipes)
 * and dispatch as the real `executionQueue` — shared code, so a preview
 * refuses what the commit would refuse and receives the inputs the commit
 * would receive — with three contract differences:
 *
 *   1. **The operation's state is restored** in a `finally`: records,
 *      selected tournament, notice buffer and mutation flag, also when a
 *      method throws under `devContext(true)`. A seeded random source is
 *      run on a fork, so the commit that follows draws what the preview
 *      showed (an opaque source cannot be forked, and is advanced). What a
 *      method does OUTSIDE the engine state (I/O, a caller-held reference
 *      it writes through) cannot be undone by any snapshot.
 *   2. **Subscribers are NOT notified.** What would fire is returned in
 *      `willEmitNotices`; the buffer is then restored to what it held
 *      before the preview, so an enclosing operation keeps its notices.
 *   3. **Dev-log lines are tagged `dryRun: true`.** Dispatch goes through
 *      the same `executeFunction` as a real mutation, so without the tag a
 *      pre-flight and the commit that follows it print identical lines and
 *      read as the mutation having fired twice. A single summary line —
 *      `{ dryRun, methods, elapsed, overhead, execute, patchOps }` — is
 *      emitted under `devContext` so the deep copies, patch walk and
 *      restore this costs are visible rather than hidden in the caller.
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
 * Cost: ONE copy of the records (the snapshot, the same copy rollbackOnError
 * takes), one diff walk of the snapshot against the live post-state, and a
 * copy of the patch's own values (proportional to the change, not the
 * record). The snapshot is restored as it is. `explain` delegates here and
 * pays the same cost.
 */
import { captureOperation, OperationState, restoreOperation } from '@Assemblies/engines/parts/operationState';
import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { withCallRandomSource, withForkedRandomSource } from '@Tools/prng';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { generatePatch, JsonPatch } from './jsonPatch';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { withCapturedClock } from '@Tools/clock';
import {
  getDevContext,
  getMethods,
  getNotices,
  getTopics,
  getTournamentRecords,
  globalLog,
} from '@Global/state/globalState';

// types
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
  /** Set when the queue was refused, or a directive's method dispatch returned `{ error }`. */
  error?: any;
  /** True when state was restored — always true in dryRun. */
  rolledBack: true;
};

export function dryRun(engine: FactoryEngine, directives: Directives): DryRunResult {
  // one instant for the whole run, as the real executionQueue would capture; see tools/clock.ts
  const run = withCapturedClock(() => withForkedRandomSource(() => dryRunAt(engine, directives)));
  if ('wouldSucceed' in run) return run;
  return refused({ ...run.error, message: run.message }); // the clock itself refused
}

function refused(error: DryRunResult['error']): DryRunResult {
  return { wouldSucceed: false, results: [], patch: [], willEmitNotices: [], error, rolledBack: true };
}

function dryRunAt(engine: FactoryEngine, directives: Directives): DryRunResult {
  const methods = getMethods();

  // the queue's own validation: a preview refuses exactly what the commit would refuse
  const invalid = validateDirectives(directives, methods);
  if (invalid) {
    const message = invalid.message ?? `method '${invalid.methodName}' not found`;
    return refused({ ...invalid.error, message });
  }

  const snapshotStart = Date.now();
  const capture = captureOperation();
  if (capture.error) return refused(capture.error);
  const { captured } = capture;
  const snapshotElapsed = Date.now() - snapshotStart;

  let run: PreviewRun;
  const restoreTiming = { elapsed: 0 };
  try {
    run = previewAgainstLiveState(engine, directives, methods, captured);
  } finally {
    const restoreStart = Date.now();
    restoreOperation(captured);
    restoreTiming.elapsed = Date.now() - restoreStart;
  }
  const restoreElapsed = restoreTiming.elapsed;
  const { results, error, patch, willEmitNotices, executeElapsed, diffElapsed } = run;

  // Cost summary. The per-method lines carry `dryRun: true` but only account for the method's own
  // execution; the snapshot, the patch walk and the restore are dryRun's overhead and are invisible
  // without this. A caller gating a UI action on `explain` pays it on every click.
  if (typeof getDevContext() === 'object') {
    globalLog(
      {
        dryRun: true,
        methods: results.length,
        elapsed: snapshotElapsed + executeElapsed + diffElapsed + restoreElapsed,
        overhead: { snapshot: snapshotElapsed, diff: diffElapsed, restore: restoreElapsed },
        execute: executeElapsed,
        patchOps: patch.length,
      },
      'sync',
    );
  }

  return {
    wouldSucceed: !error,
    results,
    patch,
    willEmitNotices,
    ...(error ? { error } : {}),
    rolledBack: true,
  };
}

type PreviewRun = Omit<DryRunResult, 'wouldSucceed' | 'rolledBack'> & { executeElapsed: number; diffElapsed: number };

// Runs the directives on the live state. The caller restores it, in a `finally`.
function previewAgainstLiveState(
  engine: FactoryEngine,
  directives: Directives,
  methods: ReturnType<typeof getMethods>,
  captured: OperationState,
): PreviewRun {
  const executeStart = Date.now();
  const results: DryRunResult['results'] = [];
  let error: DryRunResult['error'];
  for (const directive of directives) {
    const methodName = directive.method;
    const { params, unthreadedSource } = prepareDirective(directive, results);

    const result = withCallRandomSource(unthreadedSource, () =>
      executeFunction(engine, methods[methodName], params, methodName, 'sync', { dryRun: true }),
    );
    results.push({ ...result, methodName });

    if (result?.error) {
      error = result.error;
      break;
    }
  }
  const executeElapsed = Date.now() - executeStart;

  // The snapshot is the pre-state and the live records are the post-state, so no second copy is
  // needed to diff. The patch's values are copied: they would otherwise be objects of the
  // discarded post-state, or (when the engine works on a caller's objects) the caller's own.
  const diffStart = Date.now();
  const patch = generatePatch(captured.records, getTournamentRecords()).map((op) =>
    'value' in op ? { ...op, value: makeDeepCopy(op.value, false, true) } : op,
  );
  const diffElapsed = Date.now() - diffStart;

  // what WOULD fire; the buffer itself is restored by the caller, never drained
  const willEmitNotices: EmittedNotice[] = [];
  for (const topic of getTopics().topics) {
    const payloads = getNotices({ topic });
    if (payloads?.length) willEmitNotices.push({ topic, payloads });
  }

  return { results, error, patch, willEmitNotices, executeElapsed, diffElapsed };
}
