import { matchUpFormatCode, matchUpFormatGovernor } from '../../index';
import { describe, expect, it } from 'vitest';

/**
 * The aggregate decider's set number is public (CA, 2026-10-04), so a consumer that picks a set's
 * format — courthive-components' score entry, first of all — reads the rule from the factory instead
 * of keeping a copy. An aggregate format's sudden-death decider (`-F:TB1`) is set N + 1, never one of
 * the N; every other format keeps its own reading of which set is the final one.
 */
describe('the aggregate decider rule is exported', () => {
  const parsed = (code: string) => matchUpFormatCode.parse(code);

  it('names set N + 1 for an aggregate exactly format, and nothing otherwise', () => {
    expect(matchUpFormatCode.aggregateDeciderSetNumber(parsed('SET3XA-S:T10-F:TB1'))).toEqual(4);
    expect(matchUpFormatCode.aggregateDeciderSetNumber(parsed('SET7XA-S:T10P'))).toEqual(8);
    expect(matchUpFormatCode.aggregateDeciderSetNumber(parsed('SET3X-S:T10'))).toBeUndefined();
    expect(matchUpFormatCode.aggregateDeciderSetNumber(parsed('SET3-S:6/TB7-F:TB10'))).toBeUndefined();
  });

  it('lets the final-set format govern the decider alone in an aggregate format, and defers otherwise', () => {
    const aggregate = parsed('SET3XA-S:T10-F:TB1');
    expect(matchUpFormatCode.finalSetGoverns(aggregate, 3, true)).toEqual(false);
    expect(matchUpFormatCode.finalSetGoverns(aggregate, 4, false)).toEqual(true);
    const bestOf = parsed('SET3-S:6/TB7-F:TB10');
    expect(matchUpFormatCode.finalSetGoverns(bestOf, 3, true)).toEqual(true);
    expect(matchUpFormatCode.finalSetGoverns(bestOf, 2, false)).toEqual(false);
  });

  it('is reachable from both public names for the governor', () => {
    expect(matchUpFormatGovernor.aggregateDeciderSetNumber).toBe(matchUpFormatCode.aggregateDeciderSetNumber);
  });
});
