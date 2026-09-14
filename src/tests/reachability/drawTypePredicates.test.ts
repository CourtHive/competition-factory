import { describe, expect, test } from 'vitest';

import * as governors from '@Assemblies/governors';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { AD_HOC, LADDER, ROUND_ROBIN, SWISS } from '@Constants/drawDefinitionConstants';

/**
 * `isAdHocType` and `isLadder` answer "what SHAPE is this drawType", and until now neither was
 * reachable from the package.
 *
 * That was not a theoretical gap. Both 7.0.0 documents tell consumers to use them —
 * `migration-7.0.0.md` §"LADDER joins the draw types" says any code "branching on `isAdHocType`"
 * will now include ladders and to "use `isLadder` where the difference matters", and
 * `whats-new-7.0.0.md` repeats it as adoption step 8. Neither symbol was exported, so the first
 * described something no consumer could be doing and the second prescribed a remedy nobody could
 * follow.
 *
 * A third, similarly-named function IS published and is not a substitute: `isAdHoc({ structure })`
 * inspects a structure's matchUps for bracket geometry. It takes a structure rather than a drawType
 * and knows nothing about LADDER. Three near-identical names, one reachable, and the docs named the
 * two that were not.
 *
 * This is the MODULE-PATH BLINDNESS class: every existing suite for these two reaches them by module
 * path, which proves the logic and never the reach. `verify:docs-imports` could not catch it either,
 * because the guide names the functions in prose rather than in an import statement. So this suite
 * goes exclusively through the governors index and the engine, and fails exactly where a module-path
 * test stays green.
 */
describe('drawType predicates are reachable through the package surface', () => {
  test('isAdHocType and isLadder are exported from the governors index', () => {
    expect(typeof governors.drawsGovernor.isAdHocType).toEqual('function');
    expect(typeof governors.drawsGovernor.isLadder).toEqual('function');
  });

  test('isAdHocType is reachable on the engine and includes LADDER', () => {
    // The 7.0.0 claim, asserted against the engine rather than the module.
    expect(tournamentEngine.isAdHocType({ drawType: LADDER })).toEqual(true);
    expect(tournamentEngine.isAdHocType({ drawType: AD_HOC })).toEqual(true);
    expect(tournamentEngine.isAdHocType({ drawType: SWISS })).toEqual(true);
    expect(tournamentEngine.isAdHocType({ drawType: ROUND_ROBIN })).toEqual(false);
    expect(tournamentEngine.isAdHocType({})).toEqual(false);
  });

  test('isLadder is reachable on the engine and narrower than isAdHocType', () => {
    expect(tournamentEngine.isLadder({ drawType: LADDER })).toEqual(true);

    // The distinction the migration guide tells consumers to make: a ladder's
    // positionAssignments are an ordered standing, an AD_HOC draw's are a roster.
    // A caller needing that difference must be able to ask for it.
    expect(tournamentEngine.isLadder({ drawType: AD_HOC })).toEqual(false);
    expect(tournamentEngine.isLadder({ drawType: SWISS })).toEqual(false);
    expect(tournamentEngine.isLadder({})).toEqual(false);
  });

  test('isAdHoc is a different question and is not a substitute', () => {
    // Published all along, but it takes a STRUCTURE, not a drawType. Passing a drawType
    // string cannot work, which is why it could never have covered for the other two.
    expect(typeof governors.drawsGovernor.isAdHoc).toEqual('function');
    expect(tournamentEngine.isAdHoc({ structure: undefined })).toEqual(false);
  });
});
