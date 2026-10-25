/**
 * Marks the settle precheck oracle's own work (`indexPrecheck.ts`): what it reads and runs is instrumentation, not the
 * pipeline's cost, and `verify:hydrations` reads this mark to file it apart. It imports nothing, so the hydration
 * recorder can read it from inside the mocks of the very modules `indexPrecheck` imports.
 */
let oracleDepth = 0;

export const inPrecheckOracle = () => oracleDepth > 0;

export function asOracle<T>(read: () => T): T {
  oracleDepth += 1;
  try {
    return read();
  } finally {
    oracleDepth -= 1;
  }
}
