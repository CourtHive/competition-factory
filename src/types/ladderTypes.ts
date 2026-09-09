import type { LadderMovement, LadderOrdering } from '@Constants/ladderConstants';

/**
 * The rules that make a ladder a ladder. Every field varies by club — see
 * Mentat `planning/LADDER_COMPETITION_MODEL.md` §1.2 — so all of it is data.
 */
export type LadderPolicy = {
  policyName?: string;
  policyVersion?: string;

  /**
   * What produces the standing. Defaults to `RANK`.
   *
   * Read this through `getLadderOrdering` rather than the field: under `RATING` the movement rules
   * below are inapplicable, and the difference must be asked once rather than assumed throughout.
   */
  ordering?: LadderOrdering;

  /** How a challenger's win rearranges the standing. `RANK` ordering only. */
  movement?: LadderMovement;

  /**
   * How far above a participant may challenge. A number counts POSITIONS under `RANK` ordering; the
   * literal `ANY` permits challenging anyone above. (Under `RATING` a range would mean a rating
   * band — not yet modelled, and deliberately not faked with a position count.)
   */
  challengeRange?: number | 'ANY';
};

/** Where a ladder policy sits when attached to an event, draw or tournament. */
export type LadderPolicyAttachment = {
  ladder: LadderPolicy;
};
