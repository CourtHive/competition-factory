import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getOutcomePipeline } from '@Global/state/globalState';

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
 * `nothingToSettle` is true only where the index answers and the pass's own detector finds no work there. The pass then
 * returns as it would have after its first hydration, having written nothing. The index is built with what the pass
 * hydrates with: the draw alone, no tournament or event (so no participant record either, as there). A draw the index
 * does not cover (TEAM) answers false, and the pass hydrates as before.
 *
 * THE PRECHECK ORACLE, `differential` only: the same detector is asked of a hydration of the same draw, and a
 * disagreement is recorded, then thrown as a divergence when v2 compares the call (`decide.ts`), where what the call
 * wrote is restored. The call-level index oracle sees the draw only as the call found it; this one sees each state a
 * settle pass meets, after the call's writes.
 */
type PrecheckDivergence = { site: string; index: string; hydrated: string };
const pending: PrecheckDivergence[] = [];

export function nothingToSettle<T>({
  drawDefinition,
  detect,
  site,
}: {
  detect: (matchUps: HydratedMatchUp[]) => T;
  drawDefinition: DrawDefinition;
  site: string;
}): boolean {
  const index = buildStructuralIndex({ drawDefinition });
  if (index.unsupported) return false;
  const found = detect(index.matchUps);
  if (getOutcomePipeline() === OUTCOME_PIPELINE_DIFFERENTIAL) precheckOracle({ drawDefinition, detect, site, found });
  return !hasWork(found);
}

const hasWork = (found: unknown) => (Array.isArray(found) ? found.length > 0 : !!found);

function precheckOracle<T>({
  drawDefinition,
  detect,
  found,
  site,
}: {
  detect: (matchUps: HydratedMatchUp[]) => T;
  drawDefinition: DrawDefinition;
  found: T;
  site: string;
}) {
  const hydrated = getAllDrawMatchUps({ inContext: true, drawDefinition }).matchUps ?? [];
  const expected = detect(hydrated);
  if (hasWork(expected) !== hasWork(found))
    pending.push({ site, index: JSON.stringify(found ?? null), hydrated: JSON.stringify(expected ?? null) });
}

/** the disagreements recorded since the last call took them, for `decide.ts` to throw where the call is restored */
export function takePrecheckDivergences(): PrecheckDivergence[] {
  return pending.splice(0, pending.length);
}
