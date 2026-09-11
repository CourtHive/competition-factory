import type { RegistrationEntryFee } from '@Types/tournamentTypes';

export interface ResolvedEntryFee {
  amount: number;
  currencyCode: string;
  unit: string;
}

export interface IndeterminateEntryFee {
  /** the fee cannot be stated at a known scale — render it as unknown, never as a number */
  indeterminate: true;
  reason: string;
}

/**
 * Read a stored entry fee, refusing to guess its scale.
 *
 * `unit` is required on {@link RegistrationEntryFee} by construction, but records written before it
 * existed still arrive over the wire without one, and a stored record is not a compile-time object.
 * This is the read-side counterpart to that requirement: writes are strict, reads are tolerant, and
 * the tolerance takes the shape of an explicit "cannot tell" rather than an assumption.
 *
 * **The unit is never inferred from magnitude.** "6000 is obviously minor units" is wrong on a real
 * ¥6000 entry and on a genuine $6,000 pro-am, and both exist. A consumer that receives
 * `indeterminate` should render "fee on request" or similar — anything but a figure that might be
 * out by 100×.
 *
 * The same reasoning as `sumAgainstBound` in `comparePrizeMoney`: a reader that cannot evaluate must
 * say so, because a confident wrong number is worse than an admitted gap.
 */
export function resolveEntryFee(fee?: RegistrationEntryFee | null): ResolvedEntryFee | IndeterminateEntryFee {
  if (!fee || typeof fee !== 'object') {
    return { indeterminate: true, reason: 'no fee' };
  }
  if (typeof fee.amount !== 'number' || Number.isNaN(fee.amount)) {
    return { indeterminate: true, reason: 'amount is not a number' };
  }
  if (!fee.currencyCode) {
    // An absent currency is unknown, not the reader's own. Defaulting it invents data.
    return { indeterminate: true, reason: 'no currencyCode' };
  }
  if (!fee.unit) {
    return { indeterminate: true, reason: 'no unit — scale unknown' };
  }
  return { amount: fee.amount, currencyCode: fee.currencyCode, unit: fee.unit };
}

/** True when `resolveEntryFee` could not state the fee at a known scale. */
export function isIndeterminateFee(
  resolved: ResolvedEntryFee | IndeterminateEntryFee,
): resolved is IndeterminateEntryFee {
  return (resolved as IndeterminateEntryFee).indeterminate === true;
}

export interface EntryFeeRange {
  min: ResolvedEntryFee;
  max: ResolvedEntryFee;
  /** fees that could not be compared — present so a caller can disclose rather than hide them */
  indeterminate: IndeterminateEntryFee[];
  /** distinct `currencyCode`/`unit` pairs found beyond the one the range is denominated in */
  incomparable: string[];
}

/**
 * The lowest and highest of a set of fees — or nothing, when they cannot honestly be compared.
 *
 * A displayed price range ("$30–$155") is only meaningful if every contributing fee is denominated
 * identically. Comparing across currencies picks the smaller NUMBER rather than the smaller VALUE:
 * 40 EUR "beats" 45 USD on arithmetic that means nothing. So the range is computed only over the
 * single most common `currencyCode`/`unit` pair, and everything else is REPORTED rather than folded
 * in or dropped.
 *
 * Returns `undefined` when no fee can be resolved at all, so the caller renders nothing rather than
 * a zero.
 */
export function getEntryFeeRange(fees?: RegistrationEntryFee[] | null): EntryFeeRange | undefined {
  if (!Array.isArray(fees) || !fees.length) return undefined;

  const resolved: ResolvedEntryFee[] = [];
  const indeterminate: IndeterminateEntryFee[] = [];

  for (const fee of fees) {
    const result = resolveEntryFee(fee);
    if (isIndeterminateFee(result)) indeterminate.push(result);
    else resolved.push(result);
  }

  if (!resolved.length) return undefined;

  // Group by denomination; the range is taken over the largest group so a single stray currency
  // does not suppress an otherwise usable range.
  const groups = new Map<string, ResolvedEntryFee[]>();
  for (const entry of resolved) {
    const key = `${entry.currencyCode}/${entry.unit}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const [, chosen] = sorted[0];
  const incomparable = sorted.slice(1).map(([key]) => key);

  const ordered = [...chosen].sort((a, b) => a.amount - b.amount);

  return {
    min: ordered[0],
    max: ordered[ordered.length - 1],
    indeterminate,
    incomparable,
  };
}
