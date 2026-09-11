/**
 * `engine.explain(method, params)` — pre-flight readiness check.
 *
 * Lighter cousin of `dryRun`: answers "would this method succeed if I
 * called it right now?" without surfacing the per-field diff. Projects the
 * dryRun result down to the four signals UI gating actually wants:
 *
 *   {
 *     wouldSucceed: boolean;             // did the method return error-free?
 *     reason?: { code; message; info? }; // present iff wouldSucceed is false
 *     willEmitTopics: string[];          // topic names the call would fire
 *     touchesPaths: string[];            // JSON Pointer paths that would change
 *   }
 *
 * Catch sites:
 *
 *   const { wouldSucceed, reason, touchesPaths } = engine.explain(
 *     'deleteDrawDefinition',
 *     { drawId },
 *   );
 *
 *   const tooltip = wouldSucceed
 *     ? `Will remove ${touchesPaths.length} fields`
 *     : `Cannot: ${reason?.message}`;
 *
 * v1 implementation builds on `dryRun` — pays the deep-copy cost. The
 * planned "no rollback overhead" optimization (run validators only,
 * skip mutation execution + diff) is future work; ships when the engine
 * exposes per-method validator metadata.
 */
import { dryRun, DryRunResult } from './dryRun';

// constants and types
import { FactoryEngine } from '@Types/factoryTypes';

export type ExplainResult = {
  wouldSucceed: boolean;
  /** Set iff `wouldSucceed === false`. The error envelope of the first
   *  failing method (legacy POJO shape — `unwrap()`-compatible). */
  reason?: { code?: string; message?: string; info?: string };
  /** Topic names the real call would have emitted to subscribers. */
  willEmitTopics: string[];
  /** JSON Pointer paths from the dryRun patch — the set of locations the
   *  mutation would touch. Useful for "what changes if I do this?" gates
   *  and for path-scoped permission checks. */
  touchesPaths: string[];
  /** Full dryRun result, in case the caller needs the patch / per-method
   *  results / per-topic payloads. Kept under a single key so the four
   *  high-level signals above stay easy to destructure. */
  detail: DryRunResult;
};

export function explain(engine: FactoryEngine, method: string, params?: Record<string, any>): ExplainResult {
  const detail = dryRun(engine, [{ method, params }]);

  return {
    wouldSucceed: detail.wouldSucceed,
    ...(detail.error ? { reason: detail.error } : {}),
    willEmitTopics: detail.willEmitNotices.map((n) => n.topic),
    touchesPaths: detail.patch.map((op) => op.path),
    detail,
  };
}
