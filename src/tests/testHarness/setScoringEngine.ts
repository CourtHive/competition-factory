import { getScoringDifferentialTally } from '@Assemblies/engines/scoring/v2/differential';
import { setScoringEngine } from '@Global/state/globalState';
import { afterAll, beforeEach } from 'vitest';
import { appendFileSync } from 'node:fs';

// constants and types
import {
  SCORING_ENGINE_V1,
  runnableScoringEngineModes,
  type ScoringEngineMode,
} from '@Constants/scoringEngineConstants';

/**
 * Vitest setupFiles hook: `SCORING_ENGINE=differential vitest run` runs the suite with v1 deciding and the v2
 * reducer checked against it after every ScoringEngine call; a difference throws. Unset, the suite runs v1, as
 * production does. Re-applied before every test because a test may set the mode itself.
 *
 * With `SCORING_TALLY=<file>`, each test file appends what the differential compared and deferred, so a run can
 * prove it compared something (`scripts/verify/scoringDifferential.mjs`).
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
if (out)
  afterAll(() => {
    appendFileSync(out, JSON.stringify(getScoringDifferentialTally()) + '\n');
  });
