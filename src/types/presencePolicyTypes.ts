import type { ContactRelationshipUnion, ParticipantRoleUnion } from '@Types/tournamentTypes';
import type { AttributionTypeUnion } from '@Types/presenceTypes';

/**
 * How firmly presence is expected. Three-valued rather than a boolean, for consistency with D7's
 * `UNAVAILABLE` / `IF_NEEDED` / `NOT_SET` — the same family of question, asked about a different fact.
 *
 * ⚠️ **`required` does NOT mean "block".** It is a POLICY VALUE, not a behaviour: each surface reads it
 * and decides. D4d's finding is that a hard block teaches pre-emptive check-in — operators tick
 * everybody in at 9am so the software stops arguing — which destroys the signal the feature exists to
 * produce. No factory mutation refuses a check-in because of this value, and none should.
 */
export type PresenceExpectation = 'required' | 'advisory' | 'notUsed';

/** What to do about an attester the policy does not allow. */
export type OnInvalidAttribution =
  /** refuse the write — the only value that blocks, and it must be chosen deliberately */
  | 'reject'
  /** store it, and report that it was not permitted so a surface can mark it */
  | 'warn'
  /** store it silently; the default, because an unexpected attester is still a recorded fact */
  | 'record';

/**
 * Which attesters a policy permits.
 *
 * `byCategory` is the U10 case and the reason this is not a flat list: a federation that requires
 * self-attestation from adults routinely permits a parent, guardian or chaperone to sign in a
 * ten-year-old. The first entry whose category matches wins, and it REPLACES the outer lists rather
 * than merging with them — a category allowance that could only widen would be unable to express a
 * stricter rule for a junior event, which is the direction some federations actually go.
 */
export type AttributionRule = {
  allow?: AttributionTypeUnion[];
  allowedRelationships?: ContactRelationshipUnion[];
  byCategory?: AttributionCategoryRule[];
  onInvalid?: OnInvalidAttribution;
};

/**
 * A category-scoped override. Matched against the EVENT's category.
 *
 * Both selectors are optional and an entry with neither never matches — a rule that applied to
 * everything would silently shadow the outer rule it was written to refine.
 */
export type AttributionCategoryRule = {
  ageCategoryCode?: string;
  categoryName?: string;
  allow?: AttributionTypeUnion[];
  allowedRelationships?: ContactRelationshipUnion[];
};

export type PresenceFactRule = {
  expectation?: PresenceExpectation;
  attribution?: AttributionRule;
};

/**
 * Presence expectation per (role × fact) — D4h option B, chosen by CA 2026-08-24.
 *
 * Two axes, both forced:
 *
 * - **Role**, because "which roles must be present" is the question. Keyed by
 *   {@link ParticipantRoleUnion} rather than by the free-string `roleName` that `personnelRules` uses,
 *   so it resolves directly against `participant.participantRole`. ⚠️ That makes two role vocabularies
 *   inside one sanctioning policy; `personnelRules` is the older and looser of the two.
 * - **Fact**, because D4a established that *signed in* (arrival, tournament-wide, on the participant)
 *   and *checked in* (this matchUp, on the matchUp) are different facts. A policy saying "officials
 *   must check in" is otherwise ambiguous between them — and officials have only the first.
 *
 * A participant with NO `participantRole` resolves as `COMPETITOR`: an absent role means a player from
 * an older record, never a person with no part to play.
 */
export type PresenceRules = Partial<Record<ParticipantRoleUnion, PresenceRoleRules>>;

export type PresenceRoleRules = {
  signIn?: PresenceFactRule;
  matchCheckIn?: PresenceFactRule;
};

/** The two facts a presence rule can describe. */
export type PresenceFact = 'signIn' | 'matchCheckIn';
