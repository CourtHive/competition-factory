import type {
  EntryPlacement,
  LadderMovement,
  LadderOrdering,
  LapseConsequence,
  LapseKind,
  LapseWindow,
  ResultValidation,
} from '@Constants/ladderConstants';

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

  /**
   * Where a new participant joins. Defaults to `BOTTOM`.
   *
   * `BY_RATING` seats them where their rating says they belong, which is fairer to a strong
   * newcomer but displaces everyone beneath — and on a `RANK` ladder that is a real intervention,
   * since those positions were earned by challenge.
   */
  entryPlacement?: EntryPlacement;

  /**
   * Who may validate a submitted score. Defaults to `EITHER`.
   *
   * On a published ladder members report their own results, so this decides whether the opponent's
   * acceptance suffices or a tournament director must sign off.
   */
  resultValidation?: ResultValidation;

  /** Days the defender has to accept before the challenge expires. */
  acceptanceDays?: number;

  /** Days to complete the match once accepted. */
  playByDays?: number;

  /**
   * Whether declining costs the defender their position. Clubs differ, and the difference is the
   * whole character of the ladder: forfeit-on-decline makes it combative, free declines make it
   * social.
   *
   * SUGAR for `lapsePolicy: { allowance: 0, consequence: FORFEIT_POSITION }`. Kept so the simple
   * case stays simple; `lapsePolicy` wins where both are set.
   */
  declineForfeitsPosition?: boolean;

  /**
   * Declining, ignoring a challenge and not turning up are ONE mechanism, not three — they are the
   * same offence from the challenger's side, and clubs already treat them that way.
   *
   * Counted only when a challenge RESOLVES (D8), never by a background sweep. A consequence of that
   * choice: "inactivity" here means unresponsive to challenges, never "has not played". A
   * participant nobody challenges never lapses — see `removeLadderParticipant` for the manual route.
   */
  lapsePolicy?: LapsePolicy;
};

export type LapsePolicy = {
  /** Free lapses before the consequence applies. */
  allowance?: number;
  window?: LapseWindow;
  /** Days counted back when `window` is `ROLLING`. */
  windowDays?: number;
  /**
   * Which failures count. DEFAULT: all three.
   *
   * Omitting `EXPIRY` makes the whole policy avoidable — a defender simply never answers, and
   * nothing is recorded against them.
   */
  countsAsLapse?: LapseKind[];
  consequence?: LapseConsequence;
  /** Positions dropped when `consequence` is `DROP`. */
  dropPositions?: number;
};

/** Where a ladder policy sits when attached to an event, draw or tournament. */
export type LadderPolicyAttachment = {
  ladder: LadderPolicy;
};
