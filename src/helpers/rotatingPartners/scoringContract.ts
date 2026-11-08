import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { isRotatingPartnerTallyPolicy } from '@Validators/rotatingPartnerTallyPolicy';
import {
  isRotatingPartnerScoringPolicy,
  isRotatingPartnerScoringVariant,
  sameScoringVariant,
} from '@Validators/rotatingPartnerScoringPolicy';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import type {
  RotatingPartnerScoringConfiguration,
  RotatingPartnerScoringPolicyWithTimed,
  RotatingPartnerScoreContractWithTimed,
  TimedRotatingPartnerVariant,
  TimedRotatingPartnerPolicy,
} from '@Types/rotatingPartnerTimed';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objectWithKeys(value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> {
  const keys = new Set([...required, ...optional]);
  return (
    object(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => keys.has(key))
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isTimedVariant(value: unknown): value is TimedRotatingPartnerVariant {
  return (
    objectWithKeys(value, ['tieResolution']) &&
    (value.tieResolution === 'ALLOW' || value.tieResolution === 'DECIDING_POINT')
  );
}

/** Scoring input only; accepting this shape does not admit a public competitionProfile. */
export function isRotatingPartnerScoringConfiguration(value: unknown): value is RotatingPartnerScoringConfiguration {
  if (!object(value)) return false;
  if (value.kind === 'TIMED') {
    return (
      objectWithKeys(value, ['kind', 'minutes'], ['selectedVariant']) &&
      positiveInteger(value.minutes) &&
      (value.selectedVariant === undefined || isTimedVariant(value.selectedVariant))
    );
  }
  return (
    objectWithKeys(value, ['combinedPointTotal'], ['kind', 'selectedVariant']) &&
    (value.kind === undefined || value.kind === 'COMBINED_POINTS') &&
    positiveInteger(value.combinedPointTotal) &&
    (value.selectedVariant === undefined || isRotatingPartnerScoringVariant(value.selectedVariant))
  );
}

function isTimedPolicy(value: unknown): value is TimedRotatingPartnerPolicy {
  if (!objectWithKeys(value, ['defaultVariant', 'permittedVariants'], ['permittedMinutes'])) return false;
  const { defaultVariant, permittedVariants, permittedMinutes } = value;
  return (
    isTimedVariant(defaultVariant) &&
    Array.isArray(permittedVariants) &&
    permittedVariants.length > 0 &&
    permittedVariants.every(isTimedVariant) &&
    permittedVariants.some((variant) => sameScoringVariant(variant, defaultVariant)) &&
    new Set(permittedVariants.map((variant) => variant.tieResolution)).size === permittedVariants.length &&
    (permittedMinutes === undefined ||
      (Array.isArray(permittedMinutes) &&
        permittedMinutes.length > 0 &&
        permittedMinutes.every(positiveInteger) &&
        new Set(permittedMinutes).size === permittedMinutes.length))
  );
}

/** Preserve the closed combined-point policy and require a deliberate timed entry. */
export function isRotatingPartnerScoringPolicyWithTimed(
  value: unknown,
): value is RotatingPartnerScoringPolicyWithTimed {
  if (!objectWithKeys(value, ['defaultVariant', 'permittedVariants'], ['permittedPointTotals', 'timed'])) return false;
  const { timed, ...combined } = value;
  return isRotatingPartnerScoringPolicy(combined) && (!Object.hasOwn(value, 'timed') || isTimedPolicy(timed));
}

/** Read saved rules without consulting today's policy. Never mutate the historical record. */
export function normalizeRotatingPartnerScoreContract(
  value: unknown,
): RotatingPartnerScoreContractWithTimed | undefined {
  if (!object(value)) return undefined;
  if (value.kind === 'TIMED') {
    if (!objectWithKeys(value, ['kind', 'minutes', 'tieResolution'])) return undefined;
    const variant = { tieResolution: value.tieResolution };
    if (!positiveInteger(value.minutes) || !isTimedVariant(variant)) return undefined;
    return { kind: 'TIMED', minutes: value.minutes, ...variant };
  }
  if (!objectWithKeys(value, ['combinedPointTotal', 'tieResolution'], ['kind', 'winningMargin'])) return undefined;
  const { kind, combinedPointTotal, ...selectedVariant } = value;
  if (
    (kind !== undefined && kind !== 'COMBINED_POINTS') ||
    !positiveInteger(combinedPointTotal) ||
    !isRotatingPartnerScoringVariant(selectedVariant)
  )
    return undefined;
  return { combinedPointTotal, ...selectedVariant };
}

/** One mapping from the selected duration to the authoritative format, for future generation and integrity readers. */
export function rotatingPartnerContractFormat(value: unknown): string | undefined {
  const contract = normalizeRotatingPartnerScoreContract(value);
  if (!contract) return undefined;
  return 'kind' in contract
    ? `SET1-S:T${contract.minutes}P${contract.tieResolution === 'DECIDING_POINT' ? '/TB1' : ''}`
    : `SET1-S:${stringifyCombinedPointFormat(contract)}`;
}

/**
 * Internal, pure selection boundary. Callers must supply already inherited policies; this does not read a record
 * or enable timed tournament writes. The same refusal must guard selection and generation when those activate.
 */
export function resolveRotatingPartnerScoringConfiguration(params: {
  scoring: unknown;
  policy: unknown;
  tallyPolicy: unknown;
}): ResultType & { contract?: RotatingPartnerScoreContractWithTimed; selectionLocked?: boolean } {
  const { scoring, policy, tallyPolicy } = params;
  if (!isRotatingPartnerScoringConfiguration(scoring))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring configuration' };
  if (!isRotatingPartnerScoringPolicyWithTimed(policy))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring policy' };
  if (!isRotatingPartnerTallyPolicy(tallyPolicy))
    return { error: INVALID_VALUES, info: 'invalid rotating-partner tally policy' };
  const timed = scoring.kind === 'TIMED';
  const rules = timed ? policy.timed : policy;
  if (!rules) return { error: INVALID_VALUES, info: 'timed rotating-partner scoring is not enabled' };
  const selected = scoring.selectedVariant ?? rules.defaultVariant;
  if (!rules.permittedVariants.some((variant) => sameScoringVariant(variant, selected)))
    return { error: INVALID_VALUES, info: 'scoring variant is not permitted' };
  if (timed) {
    if (policy.timed?.permittedMinutes && !new Set(policy.timed.permittedMinutes).has(scoring.minutes))
      return { error: INVALID_VALUES, info: 'timed minutes are not permitted' };
    if (selected.tieResolution === 'DECIDING_POINT' && tallyPolicy.decidingPoints === 'EXCLUDE')
      return { error: INVALID_VALUES, info: 'timed deciding-point exclusion requires decided-result evidence' };
  } else if (policy.permittedPointTotals && !new Set(policy.permittedPointTotals).has(scoring.combinedPointTotal)) {
    return { error: INVALID_VALUES, info: 'combined point total is not permitted' };
  }
  const contract = normalizeRotatingPartnerScoreContract(
    timed
      ? { kind: 'TIMED', minutes: scoring.minutes, ...selected }
      : { combinedPointTotal: scoring.combinedPointTotal, ...selected },
  );
  if (!contract) return { error: INVALID_VALUES, info: 'invalid rotating-partner scoring contract' };
  return { ...SUCCESS, contract, selectionLocked: rules.permittedVariants.length === 1 };
}
