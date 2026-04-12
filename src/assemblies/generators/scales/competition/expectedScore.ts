/**
 * Logistic expectation function.
 * Returns the expected score (0-1) of player with ratingA against ratingB.
 *
 * E = 1 / (1 + 10^((ratingB - ratingA) / scale))
 */
export function expectedScore(ratingA: number, ratingB: number, scale: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / scale));
}
