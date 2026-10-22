import { setScoringEngine } from '@Global/state/globalState';
import { afterAll, beforeEach } from 'vitest';
import { appendFileSync } from 'node:fs';

// constants and types
import {
  SCORING_ENGINE_V1,
  SCORING_ENGINE_V2,
  runnableScoringEngineModes,
  type ScoringEngineMode,
} from '@Constants/scoringEngineConstants';

/**
 * Vitest setupFiles hook: `SCORING_ENGINE=differential vitest run` runs the suite with v1 deciding and the v2
 * reducer checked against it after every ScoringEngine call; a difference throws. Unset, the suite runs v1, as
 * production does. Re-applied before every test because a test may set the mode itself.
 *
 * With `SCORING_TALLY=<file>`, each test file appends what the differential compared and deferred, so a run can
 * prove it compared something (`scripts/verify/scoringDifferential.mjs`). Under `SCORING_ENGINE=v2` it appends
 * `v2:alone` once it has seen the `ScoringEngine` constructor hand back the v2 shell, so a v2 run can prove it ran
 * v2.
 *
 * The differential module is imported only then, and lazily: a setup file that imports it loads the format parser
 * and `definedAttributes` into every test file's module graph ahead of that file's own `vi.mock` of global state
 * (`definedAttributesParity.test.ts` then compares against an unmocked module).
 */
const requested = process.env.SCORING_ENGINE;
const mode: ScoringEngineMode = runnableScoringEngineModes.includes(requested as ScoringEngineMode)
  ? (requested as ScoringEngineMode)
  : SCORING_ENGINE_V1;
if (requested && mode !== requested)
  throw new Error(`SCORING_ENGINE=${requested} is not one of ${runnableScoringEngineModes.join(', ')}`);

beforeEach(() => {
  setScoringEngine(mode);
});

const out = process.env.SCORING_TALLY;
if (out && mode === SCORING_ENGINE_V2)
  afterAll(async () => {
    setScoringEngine(mode);
    const { ScoringEngine } = await import('@Assemblies/engines/scoring/ScoringEngine');
    const { ScoringEngineV2 } = await import('@Assemblies/engines/scoring/v2/engine');
    const alone = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' }) instanceof ScoringEngineV2;
    appendFileSync(out, JSON.stringify({ 'v2:alone': alone ? 1 : 0, 'v2:files': 1 }) + '\n');
  });
else if (out)
  afterAll(async () => {
    const { getScoringDifferentialTally } = await import('@Assemblies/engines/scoring/v2/differential');
    appendFileSync(out, JSON.stringify(getScoringDifferentialTally()) + '\n');
  });
