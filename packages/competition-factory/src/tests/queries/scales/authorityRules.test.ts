import { generateRankingList } from '@Query/scales/generateRankingList';
import { applyAuthorityRules } from '@Query/scales/authorityRules';
import { describe, expect, it } from 'vitest';

// constants
import { ATP, ITF, TENNIS_EUROPE, UNSPECIFIED, USTA } from '@Constants/pointsAuthorityConstants';

/**
 * A rank list's authority rules (CA 2026-11-08), moved into factory from courthive-rankings: which issuing authorities'
 * awards a list admits, and how much each one's points count. Same semantics as that service, which stores an award with
 * no authority as UNSPECIFIED and weights an unlisted authority at 1.
 */
const award = (personId: string, pointsAuthority: string | undefined, points: number) => ({
  personId,
  eventType: 'SINGLES',
  endDate: '2025-06-01',
  points,
  positionPoints: points,
  perWinPoints: 0,
  ...(pointsAuthority ? { pointsAuthority } : {}),
});
const asOfDate = '2025-12-31';
const totalOf = (entries: any[], personId: string) => entries.find((entry) => entry.personId === personId)?.totalPoints;

describe('applyAuthorityRules', () => {
  const awards: any[] = [award('p', ATP, 100), award('p', ITF, 50), award('p', USTA, 80), award('p', undefined, 10)];

  it('admits only the listed authorities; an award naming none is UNSPECIFIED', () => {
    expect(applyAuthorityRules(awards, { authorityFilter: [ATP, ITF] }).map((a: any) => a.points)).toEqual([100, 50]);
    expect(applyAuthorityRules(awards, { authorityFilter: [UNSPECIFIED] }).map((a: any) => a.points)).toEqual([10]);
  });

  it('weights every point component an award carries, and leaves the stored award unchanged', () => {
    const [weighted] = applyAuthorityRules([awards[0]], { authorityWeights: { [ATP]: 0.5 } }) as any[];
    expect(weighted).toMatchObject({ points: 50, positionPoints: 50, perWinPoints: 0 });
    expect(weighted).not.toHaveProperty('linePoints');
    expect(awards[0].points).toEqual(100);
  });

  it('counts an unlisted authority, or an unusable weight, at 1', () => {
    const out = applyAuthorityRules(awards, { authorityWeights: { [ATP]: Number.NaN, [TENNIS_EUROPE]: 2 } }) as any[];
    expect(out.map((a) => a.points)).toEqual([100, 50, 80, 10]);
  });

  it('changes nothing without rules', () => {
    expect(applyAuthorityRules(awards)).toBe(awards);
  });
});

describe('generateRankingList applies a rank list authority rules', () => {
  const pointAwards: any[] = [award('alice', ATP, 100), award('alice', USTA, 100), award('bob', USTA, 150)];

  it('a hybrid list admits only its authorities', () => {
    const entries = generateRankingList({ pointAwards, asOfDate, authorityFilter: [ATP] });
    expect(totalOf(entries, 'alice')).toEqual(100);
    expect(totalOf(entries, 'bob')).toBeUndefined();
  });

  it('a weighted list scales each authority before ranking', () => {
    const entries = generateRankingList({ pointAwards, asOfDate, authorityWeights: { [USTA]: 0.5 } });
    expect(totalOf(entries, 'alice')).toEqual(150);
    expect(totalOf(entries, 'bob')).toEqual(75);
    expect(entries[0].personId).toEqual('alice');
  });

  it('control: without rules every authority counts in full', () => {
    const entries = generateRankingList({ pointAwards, asOfDate });
    expect(totalOf(entries, 'alice')).toEqual(200);
    expect(totalOf(entries, 'bob')).toEqual(150);
  });
});
