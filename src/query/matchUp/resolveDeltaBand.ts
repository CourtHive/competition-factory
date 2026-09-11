import ratingsParameters from '@Fixtures/ratings/ratingsParameters';

// constants and types
import {
  ErrorType,
  INVALID_POLICY_DEFINITION,
  INVALID_VALUES,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

/**
 * One entry in a `deltaBands` ordered boundary list.
 *
 * A boundary is `max` (absolute rating units) XOR `maxPct` (percent of the
 * scale's range). Both on one entry is a validation error, not a precedence
 * rule. The FINAL entry omits both and catches the remainder, so N entries
 * always produce exactly N bands.
 */
export type DeltaBand = {
  maxPct?: number;
  max?: number;
  key: string;
};

export type ResolvedDeltaBoundary = {
  max?: number;
  key: string;
};

type BoundaryResult = { max?: number; error?: ErrorType; info?: string };

type OrientationResult = { ascending?: boolean; error?: ErrorType; info?: string };

type OrientationArgs = {
  ascending?: boolean;
  scaleName?: string;
};

type SignedRatingDeltaArgs = OrientationArgs & {
  oppRating?: number;
  ownRating?: number;
};

const invalidPolicy = (info: string) => ({ error: INVALID_POLICY_DEFINITION, info });

function scaleRangeMagnitude(scaleName?: string): number | undefined {
  const range = scaleName ? ratingsParameters[scaleName]?.range : undefined;
  return Array.isArray(range) && range.length === 2 ? Math.abs(range[1] - range[0]) : undefined;
}

function resolveBoundary({
  rangeMagnitude,
  scaleName,
  isFinal,
  index,
  band,
}: {
  rangeMagnitude?: number;
  scaleName?: string;
  isFinal: boolean;
  band: DeltaBand;
  index: number;
}): BoundaryResult {
  if (typeof band?.key !== 'string' || !band.key.length) return invalidPolicy(`deltaBands[${index}].key is required`);

  const hasMaxPct = band.maxPct !== undefined;
  const hasMax = band.max !== undefined;

  if (hasMax && hasMaxPct) {
    return invalidPolicy(`deltaBands[${index}] declares both max and maxPct; a boundary is one or the other`);
  }

  if (isFinal) {
    // N entries produce N bands: the final entry is the open-ended catch-all.
    // A bound here would leave deltas beyond it with no band at all.
    if (hasMax || hasMaxPct) {
      return invalidPolicy(`deltaBands[${index}] is the final entry and must omit max/maxPct to catch the remainder`);
    }
    return {};
  }

  if (!hasMax && !hasMaxPct) return invalidPolicy(`deltaBands[${index}] requires max or maxPct`);

  const declared = hasMax ? band.max : band.maxPct;
  if (typeof declared !== 'number' || !Number.isFinite(declared)) {
    return invalidPolicy(`deltaBands[${index}] ${hasMax ? 'max' : 'maxPct'} must be a finite number`);
  }

  if (hasMax) return { max: declared };

  // A percentage of an unknown range is unknowable. Never fall back to
  // treating it as absolute units — that would silently rescale every band.
  if (rangeMagnitude === undefined) {
    return invalidPolicy(
      `deltaBands[${index}].maxPct requires a scaleName with a defined range in ratingsParameters; received: ${scaleName ?? 'undefined'}`,
    );
  }

  return { max: (declared / 100) * rangeMagnitude };
}

/**
 * Validates a `deltaBands` policy list and resolves every boundary to absolute
 * rating units. Exposed separately from `resolveDeltaBand` so a caller walking
 * thousands of matchUps validates and converts once rather than per matchUp.
 */
export function resolveDeltaBoundaries(
  deltaBands?: DeltaBand[],
  scaleName?: string,
): { boundaries?: ResolvedDeltaBoundary[]; error?: ErrorType; info?: string } {
  if (!Array.isArray(deltaBands) || !deltaBands.length) {
    return { error: MISSING_VALUE, info: 'deltaBands must be a non-empty array' };
  }

  const rangeMagnitude = scaleRangeMagnitude(scaleName);
  const boundaries: ResolvedDeltaBoundary[] = [];

  for (let index = 0; index < deltaBands.length; index++) {
    const isFinal = index === deltaBands.length - 1;
    const { max, error, info } = resolveBoundary({
      band: deltaBands[index],
      rangeMagnitude,
      scaleName,
      isFinal,
      index,
    });
    if (error) return { error, info };

    const previous = boundaries.at(-1)?.max;
    if (max !== undefined && previous !== undefined && max <= previous) {
      return invalidPolicy(
        `deltaBands[${index}] resolves to ${max}, which does not exceed deltaBands[${index - 1}] (${previous}); boundaries must ascend`,
      );
    }

    boundaries.push(max === undefined ? { key: deltaBands[index].key } : { key: deltaBands[index].key, max });
  }

  return { boundaries };
}

/**
 * Ordered walk: the first band whose `max` the signed delta does not exceed.
 * The final boundary carries no `max`, so a match is guaranteed.
 */
export function bandFromBoundaries(signedDelta: number, boundaries: ResolvedDeltaBoundary[]): string | undefined {
  const matched = boundaries.find(({ max }) => max === undefined || signedDelta <= max) ?? boundaries.at(-1);
  return matched?.key;
}

/**
 * Resolves a signed rating delta to a policy-defined band.
 *
 * Generic by construction — band count and names come from `deltaBands`, in
 * contrast with `getBand` (the realized/unsigned axis), which hardcodes
 * exactly three.
 */
export function resolveDeltaBand(
  signedDelta: number,
  deltaBands?: DeltaBand[],
  scaleName?: string,
): { band?: string; error?: ErrorType; info?: string } {
  if (typeof signedDelta !== 'number' || !Number.isFinite(signedDelta)) {
    return { error: INVALID_VALUES, info: 'signedDelta must be a finite number' };
  }

  const { boundaries, error, info } = resolveDeltaBoundaries(deltaBands, scaleName);
  if (error) return { error, info };

  return { band: bandFromBoundaries(signedDelta, boundaries as ResolvedDeltaBoundary[]) };
}

/**
 * Scale orientation, which decides which way the sign points.
 *
 * `ascending: true` means a LOWER value is stronger (WTN, BWF rank). Resolved
 * from `ratingsParameters` so callers never hand-roll it — the ITA analysis
 * scripts each carrying their own copy of this is the divergence this exists to
 * remove. An unknown scale with no explicit `ascending` is an error rather than
 * an assumed orientation: guessing inverts the meaning of every band.
 */
export function resolveScaleOrientation({ ascending, scaleName }: OrientationArgs): OrientationResult {
  if (typeof ascending === 'boolean') return { ascending };

  const scaleAscending = scaleName ? ratingsParameters[scaleName]?.ascending : undefined;
  if (typeof scaleAscending === 'boolean') return { ascending: scaleAscending };

  return {
    error: MISSING_VALUE,
    info: `scale orientation unknown: pass { ascending } or a scaleName present in ratingsParameters; received: ${scaleName ?? 'undefined'}`,
  };
}

/**
 * Signed rating delta from one side's perspective, oriented so that POSITIVE
 * means a tougher opponent (playing up) and negative means playing down.
 */
export function signedRatingDelta({ ownRating, oppRating, ascending, scaleName }: SignedRatingDeltaArgs): {
  signedDelta?: number;
  error?: ErrorType;
  info?: string;
} {
  const rated = [ownRating, oppRating].every((value) => typeof value === 'number' && Number.isFinite(value));
  if (!rated) return { error: INVALID_VALUES, info: 'ownRating and oppRating must be finite numbers' };

  const orientation = resolveScaleOrientation({ ascending, scaleName });
  if (orientation.error) return { error: orientation.error, info: orientation.info };

  const own = ownRating as number;
  const opp = oppRating as number;

  return { signedDelta: orientation.ascending ? own - opp : opp - own };
}
