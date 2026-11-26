import { getTiebreakComplement } from '@Helpers/matchUpFormatCode/setRules/setComplement';
import { isSetTiebreakOnly } from './formatRules';

// constants and types
import type { SetFormat, SideNumber } from './types';

/**
 * Entering a set that IS a tiebreak — a match tiebreak.
 *
 * For a tiebreak the lower score is always entered first; when it is equal to or greater than the
 * tiebreakTo value, the complement is +2. The operator types ONE number, the lower score, and
 * the winner's is derived, which removes the ambiguity of a keypad alternating between two cells (`1` then `0` as a
 * ten, or as a one and a nothing). The derivation is the factory's `getTiebreakComplement`, which computes exactly
 * `max(tiebreakTo, lowValue + 2)` (measured across TB7 and TB10); it is not restated here.
 */

/** The points a tiebreak-only set is played to, or `undefined` if this set is not one. */
export function tiebreakOnlyTarget(setFormat?: SetFormat): number | undefined {
  return isSetTiebreakOnly(setFormat) ? setFormat?.tiebreakSet?.tiebreakTo : undefined;
}

/**
 * Both sides' points, from the LOWER score and the side it was entered on. `undefined` when the set carries no
 * target to complete against, or when the factory declines: never a guess.
 */
export function completeTiebreakOnly(
  lowValue: number,
  lowSide: SideNumber,
  setFormat?: SetFormat,
): { side1: number; side2: number } | undefined {
  const tiebreakTo = tiebreakOnlyTarget(setFormat);
  if (tiebreakTo === undefined || !Number.isFinite(lowValue)) return undefined;

  const pair = getTiebreakComplement({
    lowValue,
    tiebreakTo,
    // The PARAMETER is `tiebreakNoAd`; the FIELD is `NoAD`, as `matchUpFormatCode.parse` emits it. Neither spelling
    // can be guessed from the other, and reading the wrong field is silent.
    tiebreakNoAd: setFormat?.tiebreakSet?.NoAD,
    // `isSide1` says which slot the LOW value occupies: `true` gives `[low, high]`.
    isSide1: lowSide === 1,
  });
  if (!pair) return undefined;

  const [side1, side2] = pair;
  if (side1 === undefined || side2 === undefined) return undefined;

  return { side1, side2 };
}
