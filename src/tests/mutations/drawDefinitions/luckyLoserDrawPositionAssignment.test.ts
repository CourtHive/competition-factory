/**
 * Smoke test for the luckyLoserDrawPositionAssignment passthrough mutator.
 */
import { describe, expect, it } from 'vitest';

import { luckyLoserDrawPositionAssignment } from '@Mutate/drawDefinitions/luckyLoserDrawPositionAssignment';

describe('luckyLoserDrawPositionAssignment', () => {
  it('returns an error envelope when required params are missing', () => {
    // Thin passthrough to positionLuckyLoser — without a tournamentRecord / drawId
    // it should return the underlying error envelope rather than throwing.
    const result: any = luckyLoserDrawPositionAssignment({});
    expect(result).toBeDefined();
    expect(result.error || result.success === false).toBeTruthy();
  });
});
