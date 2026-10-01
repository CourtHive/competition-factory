/**
 * Where a tiebreak set ENDS, for any `tiebreakAt`.
 *
 * ── The assumption this replaces ──
 *
 * Every reader of `tiebreakAt` assumed the tiebreak is played AT `setTo` (7-6 ends a set to six) or one
 * below it (`@5`: 6-5 ends it), so each wrote `tiebreakAt === setTo ? setTo + 1 : setTo` in its own
 * words. A tiebreak ABOVE `setTo` — `SET5-S:6/TB7-F:6/TB7@12`, Wimbledon 2019, a code in the published
 * format table — then had no legal completed outcome anywhere: `checkSetIsComplete` wanted a tiebreak at
 * six-all, `analyzeSet` refused 12-10 as a tiebreak set without points and 13-12(5) as too many games,
 * `validateSetScore` wanted the winner on six (measured 2026-10-02, validator debate G1).
 *
 * ── The rule ──
 *
 * Call the tiebreak games `T`. The set ends by the tiebreak at `max(T + 1, setTo)` to `T`: 7-6 for
 * `@6`, 6-5 for `@5` (`setTo` six), 13-12 for `@12`, 8-7 for a pro set `@7`. It ends WITHOUT the tiebreak
 * at `setTo` or more by `winBy` clear games, and only while the loser is BELOW `T` — once both sides
 * reach `T` the tiebreak is played, so 14-12 under `@12` and 8-6 under `@6` are not scores. The ceiling
 * on either side is therefore the tiebreak winner's games, `max(T + 1, setTo)`.
 */
export type TiebreakAtFormat = { setTo?: number; tiebreakAt?: number; winBy?: number; noTiebreak?: boolean };

/** The games a tiebreak set ends at, or `undefined` where the format plays no tiebreak. */
export function tiebreakSetGames(format: TiebreakAtFormat): { winner: number; loser: number } | undefined {
  const { setTo, tiebreakAt, noTiebreak } = format;
  if (noTiebreak || typeof tiebreakAt !== 'number' || typeof setTo !== 'number') return undefined;
  return { winner: Math.max(tiebreakAt + 1, setTo), loser: tiebreakAt };
}

/** Whether both sides have reached the tiebreak games. */
export function reachedTiebreak(side1Score: number, side2Score: number, format: TiebreakAtFormat): boolean {
  const games = tiebreakSetGames(format);
  return !!games && side1Score >= games.loser && side2Score >= games.loser;
}

/** Whether the games are exactly those of a set decided by the tiebreak. */
export function isTiebreakGamesScore(winnerScore: number, loserScore: number, format: TiebreakAtFormat): boolean {
  const games = tiebreakSetGames(format);
  return !!games && winnerScore === games.winner && loserScore === games.loser;
}

/**
 * Whether the games are a set won WITHOUT its tiebreak: `setTo` or more, by `winBy`, and no further
 * past `setTo` than the loser allows — a set ends the moment the margin is reached, so a winner above
 * `setTo` is reachable only from a loser within `winBy` of it (7-5, 12-10; never 7-3 or 8-5). With a
 * tiebreak in the format the loser must also still be below the tiebreak games.
 */
export function wonWithoutTiebreak(winnerScore: number, loserScore: number, format: TiebreakAtFormat): boolean {
  const { setTo, winBy } = format;
  if (typeof setTo !== 'number') return false;
  const margin = winBy ?? 2;
  if (winnerScore < setTo || winnerScore - loserScore < margin) return false;
  if (winnerScore > Math.max(setTo, loserScore + margin)) return false;
  const games = tiebreakSetGames(format);
  if (!games) return true;
  return loserScore < games.loser && winnerScore <= games.winner;
}

/** The most games either side can hold, or `undefined` where no ceiling exists. */
export function tiebreakSetCeiling(format: TiebreakAtFormat): number | undefined {
  return tiebreakSetGames(format)?.winner;
}
