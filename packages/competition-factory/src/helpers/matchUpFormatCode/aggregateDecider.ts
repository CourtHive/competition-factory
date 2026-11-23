import { isAggregateFormat } from './isAggregateFormat';

// types
import type { Set as SetType } from '@Types/tournamentTypes';
import type { ParsedFormat } from './parse';

/**
 * The set number of an aggregate format's sudden-death decider, or `undefined` for any other format.
 *
 * A format decided by AGGREGATE points over EXACTLY N sets settles a level total with a sudden-death
 * tiebreak (`SET3XA-S:T10-F:TB1`), and that tiebreak is NOT one of the N sets: it is set N + 1, played
 * only when the totals are level (CA, 2026-10-04, the INTENNSE format). So its final-set format governs
 * set N + 1, never set N. Every other format keeps its own reading of which set is the final one.
 */
export function aggregateDeciderSetNumber(parsed: any): number | undefined {
  if (parsed?.overtimeFormat) {
    const count = parsed.overtimeFormat.count;
    return count !== 'unlimited' && parsed.finalSetFormat
      ? (parsed.exactly ?? parsed.bestOf ?? 1) + count + 1
      : undefined;
  }
  const exactly = parsed?.exactly;
  return exactly && isAggregateFormat(parsed) ? exactly + 1 : undefined;
}

/**
 * Whether the final-set format (`-F:`) governs `setNumber`, given how the caller reads it for every
 * other format: an aggregate format's decider is set N + 1 (above), and otherwise `otherwise` stands.
 */
export function finalSetGoverns(parsed: any, setNumber: number | undefined, otherwise: boolean): boolean {
  const deciderSetNumber = aggregateDeciderSetNumber(parsed);
  if (deciderSetNumber) return setNumber === deciderSetNumber;
  if (parsed?.overtimeFormat) return false;
  // A non-aggregate exactly format plays every one of its N sets, so its final set is set N, whatever
  // the count: in SET4X-S:T20P-F:T20 the fourth set is games-based even after a 3-0 lead.
  if (parsed?.exactly && setNumber !== undefined) return setNumber === parsed.exactly;
  return otherwise;
}

/**
 * Whether `setNumber` is an overtime period: past the N regulation sets and within the overtime ceiling (any number
 * past N under unlimited overtime). The decider after a finite ceiling is not one; `finalSetGoverns` names it.
 */
export function overtimePeriodGoverns(
  parsed: Readonly<ParsedFormat> | undefined,
  setNumber: number | undefined,
): boolean {
  const overtime = parsed?.overtimeFormat;
  if (!overtime || setNumber === undefined) return false;
  const regulation = parsed.exactly ?? parsed.bestOf ?? 1;
  return setNumber > regulation && (overtime.count === 'unlimited' || setNumber <= regulation + overtime.count);
}

/** The set a live point lands in: the last set while it is open, otherwise the next one. */
export function openSetNumber(sets: any[] | undefined): number {
  const last = sets?.at(-1);
  const open = last && last.winningSide === undefined && !last.segmentComplete;
  return (sets?.length ?? 0) + (open ? 0 : 1);
}

/**
 * Why an exactly-N aggregate's decider could not have been played, or `undefined`: it is set N + 1, played only
 * when the N sets end level in total. An overtime format's sequence is asked of the scoring engine instead
 * (`overtimeScoreVerdict`).
 */
export function unlevelDeciderRefusal(
  parsed: Readonly<ParsedFormat> | undefined,
  sets: Readonly<SetType>[] | undefined,
): string | undefined {
  if (parsed?.overtimeFormat) return undefined;
  const deciderSetNumber = aggregateDeciderSetNumber(parsed);
  if (!deciderSetNumber || (sets?.length ?? 0) < deciderSetNumber) return undefined;
  const [side1, side2] = (sets ?? [])
    .slice(0, deciderSetNumber - 1)
    .reduce(([a, b], set) => [a + (set.side1Score ?? 0), b + (set.side2Score ?? 0)], [0, 0]);
  if (side1 === side2) return undefined;
  return `a decider is played only on a level aggregate: the ${deciderSetNumber - 1} sets ended ${side1}-${side2}`;
}
