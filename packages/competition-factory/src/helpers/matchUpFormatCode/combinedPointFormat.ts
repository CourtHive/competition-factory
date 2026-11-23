// constants and types
import type { RotatingPartnerScoreContract, RotatingPartnerScoreAnalysis } from '@Types/rotatingPartnerScoring';
import type { Set as SetType } from '@Types/tournamentTypes';

/** One rally-scored segment ending at a combined total, with policy-resolved tie handling. */
export function parseCombinedPointFormat(value: string): RotatingPartnerScoreContract | undefined {
  const match = /^P([1-9]\d*)(DP|WB([1-9]\d*))?$/.exec(value);
  if (!match) return undefined;
  const combinedPointTotal = Number(match[1]);
  if (!Number.isSafeInteger(combinedPointTotal)) return undefined;
  if (match[2] === 'DP') return { combinedPointTotal, tieResolution: 'DECIDING_POINT' };
  if (match[3]) {
    const winningMargin = Number(match[3]);
    if (!Number.isSafeInteger(winningMargin) || winningMargin < 2) return undefined;
    return { combinedPointTotal, tieResolution: 'WIN_BY_MARGIN', winningMargin };
  }
  return { combinedPointTotal, tieResolution: 'ALLOW' };
}

export function stringifyCombinedPointFormat(contract: RotatingPartnerScoreContract): string | undefined {
  const { combinedPointTotal, tieResolution, winningMargin } = contract;
  if (!Number.isSafeInteger(combinedPointTotal) || combinedPointTotal < 1) return undefined;
  let suffix = '';
  if (tieResolution === 'DECIDING_POINT') suffix = 'DP';
  else if (tieResolution === 'WIN_BY_MARGIN') suffix = `WB${winningMargin}`;
  else if (tieResolution !== 'ALLOW') return undefined;
  const result = `P${combinedPointTotal}${suffix}`;
  const parsed = parseCombinedPointFormat(result);
  return parsed && parsed.winningMargin === winningMargin ? result : undefined;
}

/** Canonical rally totals live in side1Score/side2Score; tiebreak/game-point fields are ambiguous. */
export function analyzeCombinedPointSet(
  set: SetType,
  contract: RotatingPartnerScoreContract,
): RotatingPartnerScoreAnalysis {
  const invalid = { valid: false, complete: false };
  if (!set) return invalid;
  if (
    [set.side1TiebreakScore, set.side2TiebreakScore, set.side1PointScore, set.side2PointScore].some(
      (value) => value !== undefined,
    )
  )
    return invalid;
  if (typeof set.side1Score !== 'number' || typeof set.side2Score !== 'number') return invalid;
  const result = analyzeRotatingPartnerScore({ side1Points: set.side1Score, side2Points: set.side2Score, contract });
  if (set.winningSide !== undefined && set.winningSide !== result.winningSide) return invalid;
  return result;
}

/**
 * The combined-point completion rule: rally totals, not games or a first-to-total tiebreak. Never invent a winner for an
 * equal score.
 */
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
