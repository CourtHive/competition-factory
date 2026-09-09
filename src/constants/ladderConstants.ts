/**
 * Ladder vocabulary. See Mentat `planning/LADDER_COMPETITION_MODEL.md`.
 *
 * Every value here varies by club, which is why they are policy data rather than behaviour: a
 * ladder implementation that hardcodes any of them is wrong for the next club.
 */

/**
 * What produces the standing.
 *
 * `RANK` is the traditional ladder: `positionAssignments` are the source of truth and a completed
 * challenge mutates them. `RATING` derives the order from each participant's rating scale instead —
 * and under it NONE of the movement machinery runs, because the ordering already IS the scale.
 * `positionAssignments` becomes a projection rather than the source of truth.
 */
export const RANK = 'RANK';
export const RATING = 'RATING';
export const ladderOrderings = [RANK, RATING] as const;
export type LadderOrdering = (typeof ladderOrderings)[number];

/**
 * How a challenger's win rearranges the standing. Both are common and they are materially
 * different competitions:
 *
 * `SWAP`      — the two exchange positions. Nobody else moves.
 * `INSERTION` — the winner takes the defender's position and the defender, plus everyone between,
 *               shifts down one. A challenger who wins from far below displaces a whole run.
 */
export const SWAP = 'SWAP';
export const INSERTION = 'INSERTION';
export const ladderMovements = [SWAP, INSERTION] as const;
export type LadderMovement = (typeof ladderMovements)[number];

/** A challenge range of `ANY` means a participant may challenge anyone above them. */
export const ANY = 'ANY';

export const ladderConstants = { ANY, INSERTION, RANK, RATING, SWAP } as const;
