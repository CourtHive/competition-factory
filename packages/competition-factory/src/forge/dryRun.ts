import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { getQueueMethods } from '@Assemblies/engines/parts/engineMethodRegistry';
import { caughtErrorResult, executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { generatePatch, JsonPatch } from '@Tools/jsonPatch';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { readPreviewClocks } from '@Tools/clock';
import { withPreviewState } from './previewState';
import {
  getCallRandomSource,
  setCallRandomSource,
  getDevContext,
  getMethods,
  getNotices,
  getTopics,
  getTournamentRecords,
  globalLog,
} from '@Global/state/globalState';

// types
import type { AsyncFactoryEngine } from '@Types/asyncEngineTypes';
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
  /** Compatibility flag. Preview writes belong to its private context. */
  rolledBack: true;
};

function refused(error: DryRunResult['error']): DryRunResult {
  return { wouldSucceed: false, results: [], patch: [], willEmitNotices: [], error, rolledBack: true };
}

// The standalone helpers and engine mounts both dispatch according to the supplied engine.
const asyncPreviewEngines = new WeakSet<object>();
export function registerAsyncPreviewEngine(engine: FactoryEngine): void {
  asyncPreviewEngines.add(engine);
}

export function dryRun(engine: AsyncFactoryEngine, directives: Directives): DryRunResult | Promise<DryRunResult>;
// eslint-disable-next-line no-redeclare -- a synchronous engine always returns the result immediately
export function dryRun(engine: FactoryEngine, directives: Directives): DryRunResult;
// eslint-disable-next-line no-redeclare -- overload implementation
export function dryRun(engine: FactoryEngine | AsyncFactoryEngine, directives: Directives) {
  const awaitMethods = asyncPreviewEngines.has(engine);
  const clocks = readPreviewClocks();
  if ('error' in clocks) return refused({ ...clocks.error, message: clocks.message });
  const methods = getQueueMethods(engine, directives);

  // the queue's own validation: a preview refuses exactly what the commit would refuse
  const invalid = validateDirectives(directives, methods);
  if (invalid) {
    const message = invalid.message ?? `method '${invalid.methodName}' not found`;
    return refused({ ...invalid.error, message });
  }

  const snapshotStart = Date.now();
  const outcome = withPreviewState(directives, awaitMethods, clocks, (before, privateDirectives) => {
    const snapshotElapsed = Date.now() - snapshotStart;
    // executeFunction clears status on its dispatch receiver. A preview owns that receiver as well.
    return executePreview(Object.create(engine), privateDirectives, methods, before, snapshotElapsed, awaitMethods);
  });
  return 'error' in outcome && !('wouldSucceed' in outcome) ? refused(outcome.error) : outcome;
}

function executePreview(
  engine: FactoryEngine,
  directives: Directives,
  methods: ReturnType<typeof getMethods>,
  before: ReturnType<typeof getTournamentRecords>,
  snapshotElapsed: number,
  awaitMethods: boolean,
): DryRunResult | Promise<DryRunResult> {
  const executeStart = Date.now();
  const results: DryRunResult['results'] = [];
  const source = getCallRandomSource();
  const finish = (error?: DryRunResult['error']) =>
    finishPreview(before, results, error, snapshotElapsed, Date.now() - executeStart);

  function dispatch(from: number): DryRunResult | Promise<DryRunResult> {
    for (let index = from; index < directives.length; index++) {
      const methodName = directives[index].method;
      const { params, unthreadedSource } = prepareDirective(directives[index], results);
      // This scope belongs only to this queue. Keep a seeded directive's stream until its Promise settles.
      if (unthreadedSource) setCallRandomSource(unthreadedSource);
      const result = executeFunction(engine, methods[methodName], params, methodName, awaitMethods ? 'async' : 'sync', {
        dryRun: true,
      });
      if (awaitMethods && typeof result?.then === 'function') {
        return Promise.resolve(result)
          .catch((err) => {
            if (getDevContext()) throw err;
            return caughtErrorResult({ methodName, params, err });
          })
          .then((settled) => {
            if (unthreadedSource) setCallRandomSource(source);
            results.push({ ...settled, methodName });
            return settled?.error ? finish(settled.error) : dispatch(index + 1);
          });
      }
      if (unthreadedSource) setCallRandomSource(source);
      results.push({ ...result, methodName });
      if (result?.error) return finish(result.error);
    }
    return finish();
  }
  return dispatch(0);
}

function finishPreview(
  before: ReturnType<typeof getTournamentRecords>,
  results: DryRunResult['results'],
  error: DryRunResult['error'],
  snapshotElapsed: number,
  executeElapsed: number,
): DryRunResult {
  // Keep patch values independent of per-method results and notice payloads.
  const diffStart = Date.now();
  const patch = generatePatch(before, getTournamentRecords()).map((op) =>
    'value' in op ? { ...op, value: makeDeepCopy(op.value, false, true) } : op,
  );
  const diffElapsed = Date.now() - diffStart;

  // Include any notices already pending at entry, as a real queue would.
  const willEmitNotices: EmittedNotice[] = [];
  for (const topic of getTopics().topics) {
    const payloads = getNotices({ topic });
    if (payloads?.length) willEmitNotices.push({ topic, payloads });
  }

  if (typeof getDevContext() === 'object') {
    globalLog(
      {
        dryRun: true,
        methods: results.length,
        elapsed: snapshotElapsed + executeElapsed + diffElapsed,
        overhead: { snapshot: snapshotElapsed, diff: diffElapsed, restore: 0 },
        execute: executeElapsed,
        patchOps: patch.length,
      },
      'sync',
    );
  }
  return { wouldSucceed: !error, results, patch, willEmitNotices, ...(error ? { error } : {}), rolledBack: true };
}
