import type { CategoryAggregationRule, RankingListAward, RankingListWarning } from '@Types/rankingTypes';
import { MISSING_BIRTH_DATE, MISSING_PARTICIPANT_CONTEXT } from '@Constants/rankingConstants';
import { getAgeCategoryOrder } from './eligibleSourceWindow';

/** What `generateRankingList` may know about a participant beyond their awards. */
export type RankingParticipantContext = {
  /** ISO `YYYY-MM-DD` birth date, or undefined when it is not known. */
  birthDate?: (personId: string) => string | undefined;
};

type RetentionArgs = {
  awards: RankingListAward[];
  rule: CategoryAggregationRule;
  targetCode: string | undefined;
  asOfDate: string | undefined;
  participantContext?: RankingParticipantContext;
  onWarning?: (warning: RankingListWarning) => void;
};

/**
 * The last day a result from `sourceOrder`'s age group stays eligible: the day
 * the player became too old for that group (birth date + (maximum age + 1)
 * years), plus `retentionMonths`. Undefined for an unparseable birth date.
 */
export function getRetentionCutoff(birthDate: string, sourceOrder: number, retentionMonths: number) {
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return undefined;
  const cutoff = new Date(birth);
  cutoff.setUTCFullYear(birth.getUTCFullYear() + sourceOrder + 1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() + retentionMonths);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Apply a rule's `retentionMonthsAfterAging` to its source awards.
 *
 * Only a result from a YOUNGER age group than the target is affected — that is
 * the result a player brings with them when they age up. It stays eligible
 * until the player's aging-up date plus the retention period, measured at the
 * list's `asOfDate`. Results from the same or an older group (playing up) are
 * not touched.
 *
 * The aging-up date needs the player's birth date. When the caller supplies no
 * `participantContext.birthDate`, or a player's birth date is unknown, the
 * award is kept — the behaviour before this rule was honoured — and a warning
 * says how many players the rule could not be applied to.
 */
export function applyRetentionAfterAging({
  participantContext,
  targetCode,
  onWarning,
  asOfDate,
  awards,
  rule,
}: RetentionArgs): RankingListAward[] {
  const retentionMonths = rule.retentionMonthsAfterAging;
  if (retentionMonths === undefined) return awards;

  const targetOrder = getAgeCategoryOrder(targetCode);
  const isYounger = (award: RankingListAward) => {
    const order = getAgeCategoryOrder(award.category?.ageCategoryCode);
    return order !== undefined && targetOrder !== undefined && order < targetOrder;
  };

  const affected = awards.filter(isYounger);
  if (!affected.length) return awards;

  const birthDateOf = participantContext?.birthDate;
  if (!birthDateOf || !asOfDate) {
    onWarning?.({
      code: MISSING_PARTICIPANT_CONTEXT,
      ruleName: rule.ruleName,
      message: `retentionMonthsAfterAging: ${birthDateOf ? 'no asOfDate' : 'no participantContext.birthDate'}; ${affected.length} younger-category results carried without the retention check`,
    });
    return awards;
  }

  const unknown = new Set<string>();
  const kept = awards.filter((award) => {
    if (!isYounger(award)) return true;
    const birthDate = award.personId ? birthDateOf(award.personId) : undefined;
    const sourceOrder = getAgeCategoryOrder(award.category?.ageCategoryCode) as number;
    const cutoff = birthDate ? getRetentionCutoff(birthDate, sourceOrder, retentionMonths) : undefined;
    if (!cutoff) {
      unknown.add(award.personId);
      return true;
    }
    return asOfDate <= cutoff;
  });

  if (unknown.size) {
    onWarning?.({
      code: MISSING_BIRTH_DATE,
      ruleName: rule.ruleName,
      message: `retentionMonthsAfterAging: no usable birth date for ${unknown.size} players; their younger-category results carried without the retention check`,
    });
  }

  return kept;
}
