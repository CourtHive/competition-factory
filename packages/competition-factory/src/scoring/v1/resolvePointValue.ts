/**
 * resolvePointValue — Resolve effective point increment from multipliers
 *
 * Used by addPoint to determine how many points to add for a given result/stroke.
 * First matching multiplier wins; default is 1.
 */

import type { Point } from '@Types/scoring/types';

export interface PointMultiplier {
  condition: { results?: string[]; strokes?: string[]; setTypes?: string[] };
  value: number;
}

export function resolvePointValue(point: Partial<Point>, multipliers: PointMultiplier[]): number {
  if (!multipliers.length) return 1;

  for (const { condition, value } of multipliers) {
    if (condition.results && point.result && condition.results.includes(point.result)) {
      return value;
    }
    if (condition.strokes && point.stroke && condition.strokes.includes(point.stroke)) {
      return value;
    }
  }

  return 1;
}
