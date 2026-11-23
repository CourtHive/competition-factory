/**
 * Matrix tiers (CA, 2026-11-05). The exit-propagation matrices are most of the suite's time, and the suite runs
 * once per CI arm. An ordinary PR into dev runs a bounded, stratified SLICE of each tiered matrix; a checkpoint PR
 * into master, a push to master and every local run execute the FULL matrix. verify.yml sets
 * `FACTORY_MATRIX_TIER=pr` on a pull_request whose base is not master and nowhere else, so an unset variable means
 * full: a run that forgets the variable tests more, never less.
 *
 * Selection never moves a seed. A sliced cell is the same cell, at the same seed, as in the full matrix; the slice
 * only decides which cells register as tests.
 */
export const MATRIX_TIERS = ['full', 'pr'] as const;
export type MatrixTier = (typeof MATRIX_TIERS)[number];

const requested = process.env.FACTORY_MATRIX_TIER;
if (requested && !MATRIX_TIERS.includes(requested as MatrixTier))
  throw new Error(`FACTORY_MATRIX_TIER=${requested} is not one of ${MATRIX_TIERS.join(', ')}`);

export const matrixTier: MatrixTier = (requested as MatrixTier) || 'full';

/**
 * The cells a tiered matrix registers. Under `full`, all of them. Under `pr`, the cells are grouped by `stratum`
 * (in their original order) and each group keeps every `stride`-th cell, starting at an offset that rotates with
 * the group's position. The rotation matters: matrix cells are composed with the fastest-varying dimension
 * innermost (propagate true/false, for example), so a fixed offset would keep the same inner value in every
 * group. With a stride coprime to the inner dimensions' sizes and a rotating offset, every value of every
 * dimension still appears across the slice; `sliceMissingValues` is the check.
 *
 * Every group keeps at least one cell, so no stratum can drop out of a PR run.
 */
export function tierCells<T>(
  cells: T[],
  { stratum, stride = 3, tier = matrixTier }: { stratum: (cell: T) => string; stride?: number; tier?: MatrixTier },
): T[] {
  if (tier === 'full') return cells;
  const groups = new Map<string, T[]>();
  for (const cell of cells) {
    const key = stratum(cell);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(cell);
  }
  const keep = new Set<T>();
  [...groups.values()].forEach((group, groupIndex) => {
    const offset = groupIndex % stride;
    const kept = group.filter((_, index) => index % stride === offset);
    (kept.length ? kept : [group[groupIndex % group.length]]).forEach((cell) => keep.add(cell));
  });
  return cells.filter((cell) => keep.has(cell));
}

/**
 * For each named dimension, the values present in `cells` but absent from `slice`. An empty result means the
 * slice still exercises every value of every dimension; matrix files assert it so a change in how cells are
 * composed cannot quietly narrow a PR run.
 */
export function sliceMissingValues<T>(cells: T[], slice: T[], dimensions: (keyof T)[]): string[] {
  return dimensions.flatMap((dimension) => {
    const present = new Set(slice.map((cell) => String(cell[dimension])));
    const all = [...new Set(cells.map((cell) => String(cell[dimension])))];
    return all.filter((value) => !present.has(value)).map((value) => `${String(dimension)}=${value}`);
  });
}
