import type { CategoryAggregationRule, RankingListAward, RankingListWarning } from '@Types/rankingTypes';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { UNORDERABLE_AGE_CATEGORY } from '@Constants/rankingConstants';

// The date only frames the parse; an age category's ORDER (its maximum age)
// does not depend on it.
const ORDERING_DATE = '2000-01-01';

/**
 * The maximum age a junior category admits — `14U` → 14, `U18` → 17 — which is
 * what orders one age group against another. Undefined for a code with no upper
 * bound (`OPEN`, `35O`) or one the category parser cannot read.
 */
export function getAgeCategoryOrder(ageCategoryCode: string | undefined): number | undefined {
  if (!ageCategoryCode) return undefined;
  const details = getCategoryAgeDetails({ category: { ageCategoryCode }, consideredDate: ORDERING_DATE });
  return 'ageMax' in details && typeof details.ageMax === 'number' ? details.ageMax : undefined;
}

type WindowArgs = {
  awards: RankingListAward[];
  rule: CategoryAggregationRule;
  targetCode: string | undefined;
  onWarning?: (warning: RankingListWarning) => void;
};

/**
 * Apply a rule's `eligibleSourceWindow` to its source awards.
 *
 * The window is counted in AGE GROUPS, not years: the ladder is the distinct
 * orders of every category the rule names (source and target) plus any carried
 * by the awards themselves, so `{ olderBy: 2 }` on a 12U target admits 14U and
 * 16U when the ladder is 12/14/16/18. A side the policy leaves undeclared is
 * not limited.
 *
 * Returns `undefined` when the rule cannot be evaluated — a target or named
 * source category the parser cannot order — and reports it through
 * `onWarning`. The caller then skips the rule: carrying results across a window
 * that was never checked is the silent failure this guards against.
 */
export function applyEligibleSourceWindow({ awards, rule, targetCode, onWarning }: WindowArgs) {
  const window = rule.eligibleSourceWindow;
  if (!window || (window.olderBy === undefined && window.youngerBy === undefined)) return awards;

  const warn = (ageCategoryCode: string | undefined, message: string) =>
    onWarning?.({ code: UNORDERABLE_AGE_CATEGORY, ruleName: rule.ruleName, ageCategoryCode, message });

  const targetOrder = getAgeCategoryOrder(targetCode);
  if (targetOrder === undefined) {
    warn(targetCode, `eligibleSourceWindow: cannot order target category '${targetCode}'; rule skipped`);
    return undefined;
  }

  const namedCodes = rule.source.ageCategoryCodes ?? [];
  const unorderable = namedCodes.find((code) => getAgeCategoryOrder(code) === undefined);
  if (unorderable) {
    warn(unorderable, `eligibleSourceWindow: cannot order source category '${unorderable}'; rule skipped`);
    return undefined;
  }

  const ladderOrders = new Set<number>([targetOrder]);
  for (const code of [...namedCodes, ...(rule.target.ageCategoryCodes ?? [])]) {
    const order = getAgeCategoryOrder(code);
    if (order !== undefined) ladderOrders.add(order);
  }

  // A source scope that names no categories admits whatever the awards carry;
  // an award whose category cannot be ordered cannot be shown to sit inside the
  // window, so it is excluded and reported rather than carried.
  const ordered: { award: RankingListAward; order: number }[] = [];
  for (const award of awards) {
    const code = award.category?.ageCategoryCode;
    const order = getAgeCategoryOrder(code);
    if (order === undefined) {
      warn(code, `eligibleSourceWindow: cannot order award category '${code}'; award not carried`);
      continue;
    }
    ladderOrders.add(order);
    ordered.push({ award, order });
  }

  const ladder = [...ladderOrders].sort((a, b) => a - b);
  const targetIndex = ladder.indexOf(targetOrder);

  return ordered
    .filter(({ order }) => {
      const steps = ladder.indexOf(order) - targetIndex;
      if (steps > 0) return window.olderBy === undefined || steps <= window.olderBy;
      if (steps < 0) return window.youngerBy === undefined || -steps <= window.youngerBy;
      return true;
    })
    .map(({ award }) => award);
}
