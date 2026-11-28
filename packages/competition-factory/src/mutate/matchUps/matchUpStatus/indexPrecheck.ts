import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';

// constants and types
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * A SETTLE PASS ASKS ITS DETECTOR OF THE STRUCTURAL INDEX BEFORE IT HYDRATES. Most of v1's settle passes hydrate the
 * whole draw on every call only to run a detector that finds nothing; v1 hydrates 7 to 10 times a call, and hydration
 * is ~82% of pipeline time. The index answers every field those detectors read (a probe of every read) at 11–13% of a
 * hydration.
 *
 * `settleUnlessIdle` runs the pass unless the index says it is IDLE: the index answers and the pass's own detector
 * finds no work there. Idle, it returns `idle`, what the pass returns when its first hydration finds nothing. The index
 * is built with what the pass hydrates with: the draw alone, no tournament or event (so no participant record either,
 * as there). A TEAM draw is indexed too since S7 (`team`: a dual and its lines, built through it as hydration builds
 * them).
 */
const hasWork = (found: unknown) => (Array.isArray(found) ? found.length > 0 : !!found);

export function settleUnlessIdle<T, F>({
  drawDefinition,
  detect,
  idle,
  run,
}: {
  detect: (matchUps: HydratedMatchUp[]) => F;
  drawDefinition: DrawDefinition;
  run: () => T;
  /** the pass, as callers name it */
  site: string;
  idle: T;
}): T {
  const index = buildStructuralIndex({ drawDefinition, team: true });
  if (index.unsupported) return run();
  const found = detect(index.matchUps);
  return hasWork(found) ? run() : idle;
}
