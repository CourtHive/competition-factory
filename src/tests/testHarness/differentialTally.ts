import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { appendFileSync } from 'node:fs';
import { afterAll } from 'vitest';

/**
 * Under `OUTCOME_PIPELINE=differential` with `OUTCOME_TALLY=<file>`, each test file appends what the
 * differential compared, by route, so a whole-suite run can prove it compared something. Inert
 * otherwise.
 */
const out = process.env.OUTCOME_TALLY;
if (out)
  afterAll(() => {
    appendFileSync(out, JSON.stringify(getDifferentialTally()) + '\n');
  });
