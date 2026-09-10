import { expect, test, describe } from 'vitest';

import { POLICY_LADDER_DEFAULT } from '@Fixtures/policies/POLICY_LADDER_DEFAULT';
import mocksEngine from '@Assemblies/engines/mock';
import {
  getLadderMovement,
  getLadderOrdering,
  getLadderPolicy,
  isChallengeInRange,
} from '@Query/ladder/getLadderPolicy';

import { ANY, INSERTION, RANK, RATING, SWAP } from '@Constants/ladderConstants';
import { POLICY_TYPE_LADDER } from '@Constants/policyConstants';

describe('POLICY_LADDER defaults', () => {
  test('an unconfigured ladder runs on defaults rather than erroring', () => {
    // A ladder with no policy attached is the common case, not a misconfiguration.
    const policy = getLadderPolicy({});
    expect(policy.ordering).toEqual(RANK);
    expect(policy.movement).toEqual(SWAP);
    expect(policy.challengeRange).toEqual(3);
  });

  test('the shipped fixture is the documented shape', () => {
    expect(POLICY_LADDER_DEFAULT[POLICY_TYPE_LADDER].policyName).toEqual('Default Ladder');
  });
});

describe('the ordering SEAM', () => {
  test('defaults to RANK, and reads an explicit RATING through the same accessor', () => {
    // Everything downstream must ask getLadderOrdering, never policy.ordering — that is what keeps
    // RATING an addition rather than a rewrite.
    expect(getLadderOrdering({})).toEqual(RANK);

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: { [POLICY_TYPE_LADDER]: { ordering: RATING } },
      setState: true,
    });
    expect(getLadderOrdering({ tournamentRecord })).toEqual(RATING);
  });

  test('an attached policy overrides only what it sets', () => {
    // Partial override is the point: a club changing the movement mode should not have to restate
    // the challenge range.
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: { [POLICY_TYPE_LADDER]: { movement: INSERTION } },
      setState: true,
    });
    expect(getLadderMovement({ tournamentRecord })).toEqual(INSERTION);
    expect(getLadderPolicy({ tournamentRecord }).challengeRange).toEqual(3);
    expect(getLadderOrdering({ tournamentRecord })).toEqual(RANK);
  });
});

describe('challenge range', () => {
  const within = (challengerPosition: number, defenderPosition: number, challengeRange: any) =>
    isChallengeInRange({ challengerPosition, defenderPosition, policy: { challengeRange } });

  test('a challenge is upward only', () => {
    // Challenging someone below you is not a ladder move, whatever the range.
    expect(within(5, 8, 3)).toEqual(false); // 5 challenging 8 — downward
    expect(within(5, 5, 3)).toEqual(false); // self
    expect(within(8, 5, 3)).toEqual(true); // 8 challenging 5 — three above
  });

  test('the range is inclusive and bounded', () => {
    expect(within(8, 5, 3)).toEqual(true); // exactly 3 above
    expect(within(9, 5, 3)).toEqual(false); // 4 above — out of range
  });

  test('ANY permits anyone above', () => {
    expect(within(40, 1, ANY)).toEqual(true);
    expect(within(1, 40, ANY)).toEqual(false); // still upward only
  });

  test('a policy with no range falls back to the default rather than permitting everything', () => {
    // The dangerous failure would be treating "unset" as unlimited.
    expect(within(9, 5, undefined)).toEqual(false);
    expect(within(8, 5, undefined)).toEqual(true);
  });
});
