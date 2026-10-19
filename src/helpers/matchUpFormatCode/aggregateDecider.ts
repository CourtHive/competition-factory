import { isAggregateFormat } from './isAggregateFormat';

/**
 * The set number of an aggregate format's sudden-death decider, or `undefined` for any other format.
 *
 * A format decided by AGGREGATE points over EXACTLY N sets settles a level total with a sudden-death
 * tiebreak (`SET3XA-S:T10-F:TB1`), and that tiebreak is NOT one of the N sets: it is set N + 1, played
 * only when the totals are level (CA, 2026-10-04, the INTENNSE format). So its final-set format governs
 * set N + 1, never set N. Every other format keeps its own reading of which set is the final one.
 */
export function aggregateDeciderSetNumber(parsed: any): number | undefined {
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
  // A non-aggregate exactly format plays every one of its N sets, so its final set is set N, whatever
  // the count: in SET4X-S:T20P-F:T20 the fourth set is games-based even after a 3-0 lead.
  if (parsed?.exactly && setNumber !== undefined) return setNumber === parsed.exactly;
  return otherwise;
}

/** The set a live point lands in: the last set while it is open, otherwise the next one. */
export function openSetNumber(sets: any[] | undefined): number {
  const last = sets?.at(-1);
  const open = last && last.winningSide === undefined && !last.segmentComplete;
  return (sets?.length ?? 0) + (open ? 0 : 1);
}
