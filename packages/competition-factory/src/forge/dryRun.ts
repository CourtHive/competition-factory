import { validateDirectives } from '@Assemblies/engines/parts/directives';
import { getQueueMethods } from '@Assemblies/engines/parts/engineMethodRegistry';
import { readPreviewClocks } from '@Tools/clock';
import type { JsonPatch } from '@Tools/jsonPatch';
import { withPreviewState } from './previewState';
import { resolvePreviewDirectives } from './previewBindings';
import { runPreview } from './previewRunner';

// types
import type { AsyncFactoryEngine } from '@Assemblies/engines/types/asyncEngineTypes';
import { FactoryEngine } from '@Types/factoryTypes';
import type { Directives, QueueDirectives } from '@Assemblies/engines/types/engineTypes';

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

export function dryRun<Custom extends string = never>(
  engine: AsyncFactoryEngine,
  directives: QueueDirectives<Custom>,
): DryRunResult | Promise<DryRunResult>;
// eslint-disable-next-line no-redeclare -- a synchronous engine always returns the result immediately
export function dryRun<Custom extends string = never>(
  engine: FactoryEngine,
  directives: QueueDirectives<Custom>,
): DryRunResult;
// eslint-disable-next-line no-redeclare -- overload implementation
export function dryRun(engine: FactoryEngine | AsyncFactoryEngine, directives: Directives<string>) {
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

  const plan = resolvePreviewDirectives(engine, directives, methods);
  if (plan.error) return refused(plan.error);

  // Only a registered implementation can initiate a nested queue. Capture its complete
  // method table before entering the child; an overlapping import cannot retarget it.
  const nestedMethods = [...plan.methods.values()].some((binding) => 'custom' in binding)
    ? {
        ...getQueueMethods(
          engine,
          Object.keys(engine).map((method) => ({ method })),
        ),
      }
    : methods;
  const snapshotStart = Date.now();
  const outcome = withPreviewState(directives, awaitMethods, clocks, (state) =>
    runPreview(state, engine, plan.methods, nestedMethods, awaitMethods, snapshotStart),
  );
  return 'error' in outcome && !('wouldSucceed' in outcome) ? refused(outcome.error) : outcome;
}
