/**
 * Narrows `T | undefined | null` to `T` for a test, and fails the test when the value is absent.
 *
 * The engines type most results optional (`matchUps?`, `.find()`), so a test that reads one without a guard
 * does not type-check. Optional chaining would type-check but lets an absent value pass anything that expects
 * absence; this throws instead, so the failure names the missing value.
 */
export function defined<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) throw new Error(`expected ${what} to be defined`);
  return value;
}
