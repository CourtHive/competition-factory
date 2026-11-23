import { getDifferentialTally, takeVerificationFailures } from '@Mutate/matchUps/outcome/differential';
import { appendFileSync } from 'node:fs';
import { afterAll, afterEach, expect } from 'vitest';

// A test may catch the original provider error; verification failure must still make the gate red.
afterEach(() => expect(takeVerificationFailures(), 'outcome verification failures').toEqual([]));

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
