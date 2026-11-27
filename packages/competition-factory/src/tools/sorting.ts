/** Ascending by numeric value: a numeric string sorts by its value, and a missing value as 0. */
export function numericSort(a?: unknown, b?: unknown): number;
// eslint-disable-next-line no-redeclare -- overload implementation
export function numericSort(a, b) {
  return (a ?? 0) - (b ?? 0);
}
