import type { MonetaryAmount, PrizeMoney } from '@Types/tournamentTypes';

/**
 * Compare a proposal's prize money against a tier bound.
 *
 * Both call sites previously did `prizeMoney.reduce((sum, pm) => sum + pm.amount, 0)` and compared
 * the result to a bare number. That is wrong twice over:
 *
 *   - it adds amounts across DIFFERENT CURRENCIES, so `[{1000,'USD'},{1000,'EUR'}]` became 2000,
 *     a figure denominated in nothing;
 *   - it compared that to a bound whose currency and unit were undefined, so `15000` might have
 *     been $15,000 or $150.00.
 *
 * Now the bound carries its own currency and unit, and only amounts denominated the same way are
 * summed. Anything else is reported as incomparable rather than silently folded in or dropped — a
 * validator that cannot evaluate a rule must say so, because "no issue raised" would otherwise be
 * indistinguishable from "rule satisfied".
 */
export interface PrizeMoneyComparison {
  /** total of the entries denominated the same as the bound */
  comparable: number;
  /** distinct `currencyCode`/`unit` pairs present that the bound cannot be compared against */
  incomparable: string[];
}

export function sumAgainstBound(prizeMoney: PrizeMoney[] | undefined, bound: MonetaryAmount): PrizeMoneyComparison {
  const incomparable = new Set<string>();
  let comparable = 0;

  for (const entry of prizeMoney ?? []) {
    if (typeof entry?.amount !== 'number') continue;
    // `unit` is required on MonetaryAmount, but records predating it can still arrive over the
    // wire without one. Treat an absent unit as incomparable rather than assuming a scale — the
    // assumption is wrong 100x of the time it is wrong.
    if (entry.currencyCode === bound.currencyCode && entry.unit && entry.unit === bound.unit) {
      comparable += entry.amount;
    } else {
      incomparable.add(`${entry.currencyCode ?? '?'}/${entry.unit ?? 'UNSPECIFIED'}`);
    }
  }

  return { comparable, incomparable: [...incomparable] };
}

/** Render a bound for an operator-facing message, e.g. `15000 USD (MAJOR)`. */
export function describeAmount(amount: MonetaryAmount): string {
  return `${amount.amount} ${amount.currencyCode} (${amount.unit})`;
}
