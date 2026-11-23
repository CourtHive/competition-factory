import { prepareDirective, validateDirectives } from '@Assemblies/engines/parts/directives';
import { getQueueMethods } from '@Assemblies/engines/parts/engineMethodRegistry';
import { withCallRandomSource } from '@Tools/prng';
import { executeFunction } from '@Assemblies/engines/parts/executeMethod';
import { generatePatch, JsonPatch } from '@Tools/jsonPatch';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { readPreviewClocks } from '@Tools/clock';
import { withPreviewState } from './previewState';
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
  /** Compatibility flag. Preview writes belong to its private context. */
  rolledBack: true;
};

function refused(error: DryRunResult['error']): DryRunResult {
  return { wouldSucceed: false, results: [], patch: [], willEmitNotices: [], error, rolledBack: true };
}

export function dryRun(engine: FactoryEngine, directives: Directives): DryRunResult {
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
  const outcome = withPreviewState(directives, clocks, (before, privateDirectives) => {
    const snapshotElapsed = Date.now() - snapshotStart;
    // executeFunction clears status on its dispatch receiver. A preview owns that receiver as well.
    const run = executePreview(Object.create(engine), privateDirectives, methods, before);
    return { run, snapshotElapsed };
  });
  if ('error' in outcome) return refused(outcome.error);
  const { run, snapshotElapsed } = outcome;
  const { results, error, patch, willEmitNotices, executeElapsed, diffElapsed } = run;

  // Cost summary. The per-method lines carry `dryRun: true` but only account for the method's own
  // execution. The private copies and patch walk are preview overhead and are invisible
  // without this. A caller gating a UI action on `explain` pays it on every click.
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

// Every directive, including nested engine calls, resolves records in the private provider scope.
function executePreview(
  engine: FactoryEngine,
  directives: Directives,
  methods: ReturnType<typeof getMethods>,
  before: ReturnType<typeof getTournamentRecords>,
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

  return { results, error, patch, willEmitNotices, executeElapsed, diffElapsed };
}
