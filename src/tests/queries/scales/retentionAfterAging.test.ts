import { applyRetentionAfterAging, getRetentionCutoff } from '@Query/scales/retentionAfterAging';
import { POLICY_RANKING_POINTS_LTA } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_LTA';
import { generateRankingList } from '@Query/scales/generateRankingList';
import type { RankingListWarning } from '@Types/rankingTypes';
import { describe, expect, it } from 'vitest';

// constants
import { MISSING_BIRTH_DATE, MISSING_PARTICIPANT_CONTEXT } from '@Constants/rankingConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';

// Turned 13 — too old for 12U — on 2025-03-01; with 12 months' retention a
// 12U result stays eligible through 2026-03-01.
const BIRTH_DATE = '2012-03-01';

function makeAward(ageCategoryCode: string, points: number, personId = 'p1') {
  return {
    personId,
    eventType: SINGLES,
    points,
    positionPoints: points,
    level: 3,
    endDate: '2025-01-15',
    category: { ageCategoryCode },
  };
}

const ltaRules: any = POLICY_RANKING_POINTS_LTA[POLICY_TYPE_RANKING_POINTS].aggregationRules;
const lta14U = ltaRules.categoryAggregation.find((rule) => rule.ruleName === '14U Combined Ranking pool');

// The LTA rule with 12U added to its sources. As encoded, no LTA rule names a
// younger source category, so retention can never fire on the fixture itself.
const lta14UWithPriorCategory = {
  ...lta14U,
  source: { ageCategoryCodes: ['12U', ...lta14U.source.ageCategoryCodes] },
  maxCarriedResults: undefined,
  minResultsFromTarget: 0,
};

describe('getRetentionCutoff', () => {
  it('is the aging-up date plus the retention period', () => {
    expect(getRetentionCutoff(BIRTH_DATE, 12, 12)).toEqual('2026-03-01');
    expect(getRetentionCutoff(BIRTH_DATE, 12, 0)).toEqual('2025-03-01');
    expect(getRetentionCutoff('2012-03-01T10:00:00Z', 14, 6)).toEqual('2027-09-01');
  });

  it('is undefined for an unparseable birth date', () => {
    expect(getRetentionCutoff('not-a-date', 12, 12)).toBeUndefined();
  });
});

describe('applyRetentionAfterAging', () => {
  const awards = [makeAward('12U', 100), makeAward('14U', 50), makeAward('16U', 25)];
  const participantContext = { birthDate: () => BIRTH_DATE };
  const rule = lta14UWithPriorCategory;

  it('is a no-op when the rule declares no retention', () => {
    const noRetention = { ...rule, retentionMonthsAfterAging: undefined };
    expect(applyRetentionAfterAging({ awards, rule: noRetention, targetCode: '14U', asOfDate: '2027-01-01' })).toBe(
      awards,
    );
  });

  it('keeps a younger-category result inside the retention period and drops it after', () => {
    const inside = applyRetentionAfterAging({
      awards,
      rule,
      participantContext,
      targetCode: '14U',
      asOfDate: '2026-03-01',
    });
    expect(inside.map((a) => a.category.ageCategoryCode)).toEqual(['12U', '14U', '16U']);

    const after = applyRetentionAfterAging({
      awards,
      rule,
      participantContext,
      targetCode: '14U',
      asOfDate: '2026-03-02',
    });
    expect(after.map((a) => a.category.ageCategoryCode)).toEqual(['14U', '16U']);
  });

  it('keeps everything and warns when there is no birth-date context', () => {
    const warnings: RankingListWarning[] = [];
    const kept = applyRetentionAfterAging({
      onWarning: (w) => warnings.push(w),
      asOfDate: '2027-01-01',
      targetCode: '14U',
      awards,
      rule,
    });
    expect(kept).toBe(awards);
    expect(warnings).toEqual([expect.objectContaining({ code: MISSING_PARTICIPANT_CONTEXT, ruleName: rule.ruleName })]);
  });

  it('keeps everything and warns when there is no asOfDate', () => {
    const warnings: RankingListWarning[] = [];
    const kept = applyRetentionAfterAging({
      onWarning: (w) => warnings.push(w),
      asOfDate: undefined,
      participantContext,
      targetCode: '14U',
      awards,
      rule,
    });
    expect(kept).toBe(awards);
    expect(warnings[0].code).toEqual(MISSING_PARTICIPANT_CONTEXT);
  });

  it('keeps a player without a usable birth date and counts them in one warning', () => {
    const warnings: RankingListWarning[] = [];
    const kept = applyRetentionAfterAging({
      awards: [makeAward('12U', 100, 'known'), makeAward('12U', 100, 'unknown'), makeAward('12U', 100, 'garbled')],
      participantContext: { birthDate: (id) => ({ known: BIRTH_DATE, garbled: 'x' })[id] },
      onWarning: (w) => warnings.push(w),
      asOfDate: '2027-01-01',
      targetCode: '14U',
      rule,
    });
    expect(kept.map((a) => a.personId)).toEqual(['unknown', 'garbled']);
    expect(warnings).toEqual([expect.objectContaining({ code: MISSING_BIRTH_DATE })]);
    expect(warnings[0].message).toContain('2 players');
  });

  it('never warns when no younger-category result is in play', () => {
    const warnings: RankingListWarning[] = [];
    applyRetentionAfterAging({
      awards: [makeAward('16U', 10)],
      onWarning: (w) => warnings.push(w),
      asOfDate: '2027-01-01',
      targetCode: '14U',
      rule,
    });
    expect(warnings).toEqual([]);
  });
});

describe('generateRankingList — retentionMonthsAfterAging (LTA 14U pool)', () => {
  const pointAwards = [makeAward('12U', 100), makeAward('14U', 30)];
  const run = (asOfDate: string, participantContext?: any, onWarning?: (w: RankingListWarning) => void) =>
    generateRankingList({
      aggregationRules: { rollingPeriodDays: 730, categoryAggregation: [lta14UWithPriorCategory] },
      categoryFilter: { ageCategoryCodes: ['14U'] },
      participantContext,
      pointAwards,
      onWarning,
      asOfDate,
    });

  it('the LTA fixture as encoded names no younger source category', () => {
    for (const rule of ltaRules.categoryAggregation) {
      const target = rule.target.ageCategoryCodes[0];
      expect(rule.source.ageCategoryCodes.every((code) => Number.parseInt(code) >= Number.parseInt(target))).toEqual(
        true,
      );
    }
  });

  it('carries the 12U result while retained, and stops on the day after the period ends', () => {
    const context = { birthDate: () => BIRTH_DATE };
    // 14U 30 native + carried (12U 100 and 14U 30; the LTA pool lists its own target as a source)
    expect(run('2026-03-01', context)[0].totalPoints).toEqual(160);
    expect(run('2026-03-02', context)[0].totalPoints).toEqual(60);
  });

  it('without participant context behaves as before and says so', () => {
    const warnings: RankingListWarning[] = [];
    expect(run('2026-06-01', undefined, (w) => warnings.push(w))[0].totalPoints).toEqual(160);
    expect(warnings.map((w) => w.code)).toEqual([MISSING_PARTICIPANT_CONTEXT]);
  });
});
