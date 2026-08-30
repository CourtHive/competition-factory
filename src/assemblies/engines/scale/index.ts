import * as rankingGovernor from '@Assemblies/governors/rankingGovernor';
import { calculateNewRatings } from '@Generators/scales/calculateNewRatings';
import { generateDynamicRatings } from '@Generators/scales/generateDynamicRatings';
import syncEngine from '@Assemblies/engines/sync';

const ratingsGovernor = {
  calculateNewRatings,
  generateDynamicRatings,
};

/**
 * `scaleEngine` IS the shared `syncEngine` singleton, with the ranking and ratings
 * governors attached to it. That attachment MUST stay inside this initializer.
 *
 * The obvious spelling — a top-level `syncEngine.importMethods(...)` followed by
 * `export { syncEngine as scaleEngine }` — is a pure re-export alias, so Rollup
 * flattens it: `dist/esm/index.mjs` then exports `scaleEngine` straight off the
 * sync module and demotes this one to a bare `import './scale/index.mjs'`. With
 * `"sideEffects": false` in package.json, a consumer bundler is entitled to drop
 * that bare import — and Vite/esbuild do, in production builds only. The engine
 * still arrives with `setState`, so the failure surfaces late, as
 * `scaleEngine.generateDynamicRatings is not a function` at the call site.
 *
 * Declaring the binding here, with the side effect in its initializer, makes the
 * module un-droppable for anyone who imports `scaleEngine`. `verify:runtime`
 * bundles a tree-shaken consumer to hold this. Do not "simplify" it back to a
 * re-export.
 */
const scaleEngine = (() => {
  syncEngine.importMethods({ ...rankingGovernor, ...ratingsGovernor });
  return syncEngine;
})();

export { scaleEngine };
export default scaleEngine;
