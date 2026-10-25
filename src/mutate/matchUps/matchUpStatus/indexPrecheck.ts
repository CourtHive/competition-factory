import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getOutcomePipeline } from '@Global/state/globalState';
import { captureRecord } from '@Tools/recordDiff';
import { asOracle } from './precheckOracleMark';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * A SETTLE PASS ASKS ITS DETECTOR OF THE STRUCTURAL INDEX BEFORE IT HYDRATES (outcome executor plan § 3.1.1, the v1
 * win CA agreed 2026-10-24). Most of v1's settle passes hydrate the whole draw on every call only to run a detector that
 * finds nothing; v1 hydrates 7 to 10 times a call, and hydration is ~82% of pipeline time. The index answers every
 * field those detectors read (a probe of every read, Mentat report 2026-10-24 `outcome-v2-s2-structural-index-fields`;
 * the index oracle holds the two equal on every call in `differential`) at 11–13% of a hydration.
 *
 * `settleUnlessIdle` runs the pass unless the index says it is IDLE: the index answers and the pass's own detector
 * finds no work there. Idle, it returns `idle`, what the pass returns when its first hydration finds nothing. The index
 * is built with what the pass hydrates with: the draw alone, no tournament or event (so no participant record either,
 * as there). A draw the index does not cover (TEAM) is never idle, and the pass runs as before.
 *
 * THE PRECHECK ORACLE, `differential` only, two questions, each a divergence keyed `precheck:<pass>` thrown when v2
 * compares the call (`decide.ts`), where what the call wrote is restored:
 *  - AGREEMENT: the detector asked of a hydration of the same draw says the same. The call-level index oracle sees the
 *    draw only as the call found it; this one sees each state a settle pass meets, after the call's writes.
 *  - COMPLETENESS: the pass runs anyway, and where the index said idle it must write nothing. A detector that misses
 *    work its pass does is a pass the skip would have dropped.
 */
type PrecheckDivergence = { site: string; index: string; hydrated: string };
const pending: PrecheckDivergence[] = [];

const hasWork = (found: unknown) => (Array.isArray(found) ? found.length > 0 : !!found);

export function settleUnlessIdle<T, F>({
  drawDefinition,
  detect,
  idle,
  site,
  run,
}: {
  detect: (matchUps: HydratedMatchUp[]) => F;
  drawDefinition: DrawDefinition;
  run: () => T;
  site: string;
  idle: T;
}): T {
  const index = buildStructuralIndex({ drawDefinition });
  if (index.unsupported) return run();
  const found = detect(index.matchUps);
  const predictedIdle = !hasWork(found);
  if (getOutcomePipeline() !== OUTCOME_PIPELINE_DIFFERENTIAL) return predictedIdle ? idle : run();

  const hydrated = asOracle(() => getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? []);
  const expected = asOracle(() => detect(hydrated));
  if (hasWork(expected) !== hasWork(found))
    pending.push({ site, index: JSON.stringify(found ?? null), hydrated: JSON.stringify(expected ?? null) });
  if (!predictedIdle) return run();
  const before = captureRecord(drawDefinition);
  const result = asOracle(run);
  if (captureRecord(drawDefinition) !== before) pending.push({ site, index: 'idle', hydrated: 'the pass wrote' });
  return result;
}

/** the disagreements recorded since the last call took them, for `decide.ts` to throw where the call is restored */
export function takePrecheckDivergences(): PrecheckDivergence[] {
  return pending.splice(0, pending.length);
}
