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
   * Which rating orders the standing under `RATING` ordering — `UTR`, `WTN`, `ELO` and so on.
   * Whether a higher or lower value is better comes from `ratingsParameters[ratingType].ascending`,
   * never from an assumption here: WTN and BWF are lower-is-better while UTR and ELO are not.
   */
  ratingType?: string;

  /**
   * Derive the rating within the ladder rather than reading a published one.
   *
   * The known rating supplies each participant's STARTING position and the factory moves it from
   * there on results — the same `<scaleName>.DYNAMIC` pattern DrawMatic uses, so a club can run a
   * rating-ordered ladder without every member holding a current published rating.
   */
  dynamicRating?: boolean;

  /**
   * How far above a participant may challenge. A number counts POSITIONS under `RANK` ordering; the
   * literal `ANY` permits challenging anyone above. (Under `RATING` a range would mean a rating
   * band — not yet modelled, and deliberately not faked with a position count.)
   */
  challengeRange?: number | 'ANY';

  /** Days the defender has to accept before the challenge expires. */
  acceptanceDays?: number;

  /** Days to complete the match once accepted. */
  playByDays?: number;

  /**
   * Whether declining costs the defender their position. Clubs differ, and the difference is the
   * whole character of the ladder: forfeit-on-decline makes it combative, free declines make it
   * social.
   */
  declineForfeitsPosition?: boolean;
};

/** Where a ladder policy sits when attached to an event, draw or tournament. */
export type LadderPolicyAttachment = {
  ladder: LadderPolicy;
};
