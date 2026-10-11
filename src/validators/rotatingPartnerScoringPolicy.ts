// constants and types
import type { RotatingPartnerScoringPolicy, RotatingPartnerScoringVariant } from '@Types/rotatingPartnerScoring';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isRotatingPartnerScoringVariant(value: unknown): value is RotatingPartnerScoringVariant {
  if (!object(value) || !Object.hasOwn(value, 'tieResolution')) return false;
  const keys = new Set(['tieResolution', 'winningMargin']);
  if (Object.keys(value).some((key) => !keys.has(key))) return false;
  if (value.tieResolution === 'WIN_BY_MARGIN')
    return Number.isSafeInteger(value.winningMargin) && Number(value.winningMargin) >= 2;
  return (
    (value.tieResolution === 'ALLOW' || value.tieResolution === 'DECIDING_POINT') && value.winningMargin === undefined
  );
}

export function sameScoringVariant(a: RotatingPartnerScoringVariant, b: RotatingPartnerScoringVariant): boolean {
  return a.tieResolution === b.tieResolution && a.winningMargin === b.winningMargin;
}

/** Invalid governing rules are refused, never replaced with a permissive default. */
export function isRotatingPartnerScoringPolicy(value: unknown): value is RotatingPartnerScoringPolicy {
  if (!object(value)) return false;
  const keys = new Set(['defaultVariant', 'permittedVariants', 'permittedPointTotals']);
  if (Object.keys(value).some((key) => !keys.has(key))) return false;
  const { defaultVariant, permittedVariants, permittedPointTotals } = value;
  if (
    !isRotatingPartnerScoringVariant(defaultVariant) ||
    !Array.isArray(permittedVariants) ||
    !permittedVariants.length
  )
    return false;
  if (!permittedVariants.every(isRotatingPartnerScoringVariant)) return false;
  if (!permittedVariants.some((variant) => sameScoringVariant(variant, defaultVariant))) return false;
  if (
    permittedVariants.some((variant, index) =>
      permittedVariants.slice(index + 1).some((other) => sameScoringVariant(variant, other)),
    )
  )
    return false;
  return (
    permittedPointTotals === undefined ||
    (Array.isArray(permittedPointTotals) &&
      permittedPointTotals.length > 0 &&
      permittedPointTotals.every((total) => Number.isSafeInteger(total) && total > 0) &&
      new Set(permittedPointTotals).size === permittedPointTotals.length)
  );
}
