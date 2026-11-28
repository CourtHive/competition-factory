import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { describe, expect, it } from 'vitest';

import type { AwardProfile } from '@Types/rankingTypes';
import type { Category } from '@Types/tournamentTypes';

// A profile scoped by a category field matches only a category that carries a listed value; a category that carries
// another value, or none, does not select it.
const scoped = (category: AwardProfile['category']): AwardProfile[] => [
  { profileName: 'scoped', category, finishingPositionRanges: { 1: 100 } },
];

const category: Category = {
  categoryName: 'U14',
  type: 'AGE',
  ratingType: 'WTN',
  ballType: 'STAGE1GREEN',
  subType: 'OPEN',
};

describe('getAwardProfile category scope', () => {
  it.each([
    ['categoryNames', { categoryNames: ['U14'] }, { categoryNames: ['U16'] }],
    ['categoryTypes', { categoryTypes: ['AGE'] }, { categoryTypes: ['LEVEL'] }],
    ['ratingTypes', { ratingTypes: ['WTN'] }, { ratingTypes: ['UTR'] }],
    ['ballTypes', { ballTypes: ['STAGE1GREEN'] }, { ballTypes: ['STAGE2ORANGE'] }],
    ['subTypes', { subTypes: ['OPEN'] }, { subTypes: ['CLOSED'] }],
  ] as const)('%s: a listed value matches, another value does not', (_, matching, other) => {
    expect(getAwardProfile({ awardProfiles: scoped(matching as any), category }).awardProfile?.profileName).toEqual(
      'scoped',
    );
    expect(getAwardProfile({ awardProfiles: scoped(other as any), category }).awardProfile).toBeUndefined();
  });

  it('wheelchairClasses: matches the participant class, not another or none', () => {
    const awardProfiles = scoped({ wheelchairClasses: ['QUAD'] } as any);
    expect(getAwardProfile({ awardProfiles, wheelchairClass: 'QUAD' }).awardProfile?.profileName).toEqual('scoped');
    expect(getAwardProfile({ awardProfiles, wheelchairClass: 'OPEN' }).awardProfile).toBeUndefined();
    expect(getAwardProfile({ awardProfiles }).awardProfile).toBeUndefined();
  });
});
