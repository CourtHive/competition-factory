// constants and types
import type { RotatingPartnerScoreAnalysis, RotatingPartnerScoreContract } from '@Types/rotatingPartnerScoring';

/** Rally totals, not games or a first-to-total tiebreak. Never invent a winner for an equal score. */
export function analyzeRotatingPartnerScore({
  side1Points,
  side2Points,
  contract,
}: {
  side1Points: number;
  side2Points: number;
  contract: RotatingPartnerScoreContract;
}): RotatingPartnerScoreAnalysis {
  const invalid = { valid: false, complete: false };
  const { combinedPointTotal: target, tieResolution, winningMargin } = contract;
  if (
    !Number.isSafeInteger(target) ||
    target <= 0 ||
    !Number.isSafeInteger(side1Points) ||
    !Number.isSafeInteger(side2Points) ||
    side1Points < 0 ||
    side2Points < 0 ||
    !new Set(['ALLOW', 'DECIDING_POINT', 'WIN_BY_MARGIN']).has(tieResolution) ||
    (tieResolution === 'WIN_BY_MARGIN'
      ? !Number.isSafeInteger(winningMargin) || (winningMargin ?? 0) < 2
      : winningMargin !== undefined)
  )
    return invalid;

  const total = side1Points + side2Points;
  if (!Number.isSafeInteger(total)) return invalid;
  const difference = Math.abs(side1Points - side2Points);
  if (total < target) return { valid: true, complete: false };
  if (total > target) {
    // Extra play is reachable only from a tie at an even base total.
    const midpoint = target / 2;
    if (target % 2 || Math.min(side1Points, side2Points) < midpoint || tieResolution === 'ALLOW') return invalid;
    if (tieResolution === 'DECIDING_POINT' && total !== target + 1) return invalid;
    // A larger margin means a terminal result was passed without stopping.
    if (tieResolution === 'WIN_BY_MARGIN' && difference > (winningMargin ?? 0)) return invalid;
  }

  const complete =
    total === target
      ? difference > 0 || tieResolution === 'ALLOW'
      : tieResolution === 'DECIDING_POINT' || difference === winningMargin;
  if (!complete) return { valid: true, complete: false };
  return difference === 0
    ? { valid: true, complete: true, tied: true }
    : { valid: true, complete: true, winningSide: side1Points > side2Points ? 1 : 2 };
}
