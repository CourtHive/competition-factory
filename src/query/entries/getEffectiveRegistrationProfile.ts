import type { Event, EventRegistration, RegistrationProfile, Tournament } from '@Types/tournamentTypes';

/** The six fields an event may override. Anything else is tournament-wide by nature. */
const OVERRIDABLE = [
  'entriesOpen',
  'entriesClose',
  'withdrawalDeadline',
  'entryFees',
  'entryUrl',
  'eligibilityNotes',
] as const;

export type EffectiveRegistrationProfile = Pick<RegistrationProfile, (typeof OVERRIDABLE)[number]>;

/**
 * The registration facts that actually apply to an event.
 *
 * **The cascade is FIELD BY FIELD, not object by object, and that distinction is the whole reason
 * this function exists.** The obvious implementation —
 *
 * ```ts
 * event.registrationProfile ?? tournamentRecord.registrationProfile
 * ```
 *
 * — is wrong in a way that looks right: an event that overrides only `entriesClose` would silently
 * lose the tournament's `entryUrl`, `entryFees` and every other field, because the whole object was
 * replaced rather than merged. The failure is invisible at the call site and shows up as a missing
 * registration link on one division.
 *
 * So every reader of a registration window must come through here rather than reaching for the
 * fallback themselves. `Event.sanction` documents a similar inheritance, but that field is coarser —
 * a sanction is taken whole — which is exactly why the finer rule is stated and enforced here
 * instead of left to be inferred from the neighbouring one.
 *
 * Only the six overridable fields are returned. The tournament's logistics, sponsors and dress code
 * are not event-scoped concepts and are read from `tournamentRecord.registrationProfile` directly.
 *
 * An `undefined` value on the event does NOT override — absent means "not stated here", never
 * "explicitly nothing". A `null` is preserved, so a producer can still say "this event has no
 * entry URL" when it means it.
 */
export function getEffectiveRegistrationProfile(params: {
  event?: Event;
  tournamentRecord?: Tournament;
}): EffectiveRegistrationProfile {
  const { event, tournamentRecord } = params ?? {};

  const tournamentProfile: Partial<RegistrationProfile> = tournamentRecord?.registrationProfile ?? {};
  const eventProfile: Partial<EventRegistration> = event?.registrationProfile ?? {};

  const effective: Record<string, any> = {};
  for (const field of OVERRIDABLE) {
    const eventValue = (eventProfile as Record<string, any>)[field];
    const tournamentValue = (tournamentProfile as Record<string, any>)[field];
    effective[field] = eventValue === undefined ? tournamentValue : eventValue;
  }

  return effective as EffectiveRegistrationProfile;
}

/**
 * Entry fees that apply to an event, narrowed by the fee's own selectors.
 *
 * A tournament-grain fee list can carry entries for several events, so "the fees on this record" is
 * not the same question as "the fees for this event". Selectors are matched most-specific first:
 * `eventId` > `category` > `eventType`. A fee with NO selector applies to every event — that is how
 * a single tournament-wide price is stated.
 *
 * Returns only the most specific tier that matched, rather than everything that matched: a fee
 * keyed to this exact `eventId` supersedes a blanket "all doubles" price, and returning both would
 * leave the caller to re-derive precedence and get it wrong.
 */
export function getEventEntryFees(params: { event?: Event; tournamentRecord?: Tournament }) {
  const { event, tournamentRecord } = params ?? {};
  if (!event) return [];

  const fees = getEffectiveRegistrationProfile({ event, tournamentRecord })?.entryFees ?? [];

  const byEventId = fees.filter((fee) => fee?.eventId && fee.eventId === event.eventId);
  if (byEventId.length) return byEventId;

  const categoryName = event.category?.categoryName ?? event.category?.ageCategoryCode;
  const byCategory = fees.filter((fee) => fee?.category && categoryName && fee.category === categoryName);
  if (byCategory.length) return byCategory;

  const byEventType = fees.filter((fee) => fee?.eventType && fee.eventType === event.eventType);
  if (byEventType.length) return byEventType;

  // No selector at all = tournament-wide. Fees selecting a DIFFERENT event are excluded here rather
  // than returned as a fallback, which is why this is not simply `fees`.
  return fees.filter((fee) => !fee?.eventId && !fee?.category && !fee?.eventType);
}
