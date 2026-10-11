import { analyzeRotatingPartnerScore } from '@Query/matchUp/rotatingPartnerScore';

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
