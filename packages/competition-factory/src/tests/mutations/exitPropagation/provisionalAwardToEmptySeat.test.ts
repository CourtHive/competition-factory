import { isProvisionalDecision } from '@Tests/testHarness/exitPropagation/properties';
import { replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { describe, expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A PRODUCED WALKOVER AWARDED TO AN EMPTY SEAT IS PROVISIONAL — CA, 2026-10-12.
 *
 * CA's 2026-09-21 definition of a provisional decision is "propagated, holding nobody, awarded to nobody". The census
 * read "awarded to nobody" as "no `winningSide`", so RULE 2's produced walkover — awarded to the side without the exit
 * even while that side is still empty — failed it, while the SAME waiting walkover written pending (relayed past a
 * BYE, no `winningSide`) passed. Both are a produced exit waiting for an arrival. An award to a seated participant is
 * a resolved result, and is still not provisional. Oracle only: the engine is unchanged.
 *
 * Reproduction: census s14, COMPASS 32/32 seed 20503744 under `doubleExitPropagateBye: false`. `South|3|1` reads
 * WALKOVER, winningSide 1, holding nobody; it becomes TO_BE_PLAYED with a participant once `South|2|2`'s double
 * walkover dissolves, and the census reported MONOTONIC_DECISION for that transition.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/censusProvisionalAwardToEmptySeat20261013.jsonl');
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const PRODUCED = { sideExitProvenance: { 2: { sourceMatchUpId: 'source', previousMatchUpStatus: 'DOUBLE_WALKOVER' } } };
const seated = (participantId?: string) => [
  { sideNumber: 1, ...(participantId ? { participantId } : {}) },
  { sideNumber: 2 },
];

describe('a provisional decision is propagated, holding nobody, awarded to nobody', () => {
  it('a produced walkover awarded to an EMPTY seat is provisional', () => {
    expect(isProvisionalDecision({ ...PRODUCED, matchUpStatus: 'WALKOVER', winningSide: 1, sides: seated() })).toBe(
      true,
    );
  });

  it('the same waiting walkover written pending (no winningSide) is provisional', () => {
    expect(isProvisionalDecision({ ...PRODUCED, matchUpStatus: 'WALKOVER', sides: seated() })).toBe(true);
  });

  it('an award to a SEATED participant is not provisional', () => {
    expect(
      isProvisionalDecision({ ...PRODUCED, matchUpStatus: 'WALKOVER', winningSide: 1, sides: seated('arrived') }),
    ).toBe(false);
  });

  it('a decision with no propagation record is not provisional', () => {
    expect(isProvisionalDecision({ matchUpStatus: 'WALKOVER', winningSide: 1, sides: seated() })).toBe(false);
  });

  it('census s14 COMPASS 20503744 (policy off) no longer reports MONOTONIC_DECISION', () => {
    expect(config.seed).toEqual(20503744);
    expect(steps.length).toEqual(30);
    setSubscriptions({});
    const failure = replay(config, steps, 'provisional-award-to-empty-seat', POLICY_OFF);
    expect(failure?.property).not.toEqual('MONOTONIC_DECISION');
  });
});
