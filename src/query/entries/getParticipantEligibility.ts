import { getEventDateRange, validateParticipantCategory } from '@Query/entries/categoryValidation';

// constants and types
import { MISSING_PARTICIPANT, MISSING_EVENT } from '@Constants/errorConditionConstants';
import type { RejectionReason } from '@Query/entries/categoryValidation';
import type { Event, Participant, Tournament } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

export interface ParticipantEligibility {
  /** the participant satisfies every category rule that could be evaluated */
  eligible: boolean;
  /**
   * At least one rule could NOT be evaluated because the data it needs is absent — an unknown
   * birthDate, an unrecorded rating. Distinct from `eligible: false`, which asserts a rule is
   * BREACHED. When true, `eligible` is false and the honest reading is "cannot be determined".
   */
  indeterminate: boolean;
  rejectionReasons: RejectionReason[];
}

/**
 * Whether a participant may enter an event — asked, rather than attempted.
 *
 * The predicate itself is not new: `validateParticipantCategory` has evaluated age at both event
 * ends, handled exact-DOB and calendar-year (`birthYear`) conventions, and expanded
 * `ageCategoryCode` since it was written. It was reachable only through `addEventEntries`, so the
 * one way to learn whether someone could enter was to try to enter them. A discovery surface
 * evaluating one person against thousands of events with no intent to enter any of them cannot use
 * a mutation.
 *
 * **This does not change who gets entered.** `addEventEntries` keeps its own behaviour exactly:
 * a participant whose birthDate is unknown is still filtered out of the entry list there, while
 * here the same participant reports `indeterminate`. That divergence is deliberate. The two call
 * sites share a predicate and apply different policy to its output, because "we cannot tell" is
 * correctly a refusal when writing an entry and correctly NOT a refusal when answering a question.
 * `entryEligibility.test.ts` pins both halves so the asymmetry is not later tidied into a bug.
 *
 * Read-only: emits no notices and mutates nothing.
 */
export function getParticipantEligibility(params: {
  participant: Participant;
  event: Event;
  tournamentRecord?: Tournament;
}): ResultType & Partial<ParticipantEligibility> {
  const { participant, event, tournamentRecord } = params ?? {};

  if (!participant?.participantId) return { error: MISSING_PARTICIPANT };
  if (!event?.eventId) return { error: MISSING_EVENT };

  // An event with no category restricts nobody. Not a silent pass: there is genuinely no rule.
  if (!event.category) return { eligible: true, indeterminate: false, rejectionReasons: [] };

  const dateRange = getEventDateRange(event, tournamentRecord);
  if ('error' in dateRange) return { error: dateRange.error };

  const rejection = validateParticipantCategory(
    participant,
    event.category,
    event,
    dateRange.startDate,
    dateRange.endDate,
    tournamentRecord,
  );

  if (!rejection) return { eligible: true, indeterminate: false, rejectionReasons: [] };

  const rejectionReasons = rejection.rejectionReasons;

  // Indeterminate only when NOTHING was actually breached. A participant who is both over the age
  // limit and missing a rating is ineligible, full stop — the missing rating cannot soften a
  // breach that was established on other grounds.
  const indeterminate = rejectionReasons.length > 0 && rejectionReasons.every((reason) => reason.indeterminate);

  return { eligible: false, indeterminate, rejectionReasons };
}

export interface EventEligibility extends ParticipantEligibility {
  eventId: string;
}

/**
 * The same question across many events — "which of these can I enter".
 *
 * The bulk form exists because that is the shape callers actually need; asking per event means a
 * caller re-resolves the participant and the tournament for every one of them.
 *
 * Events that cannot be evaluated at all (no resolvable date range, for instance) are returned as
 * `indeterminate`, never dropped. A silently shortened list is indistinguishable from a list where
 * those events were checked and found ineligible.
 */
export function getEligibleEvents(params: {
  participant: Participant;
  events: Event[];
  tournamentRecord?: Tournament;
}): ResultType & { eventEligibility?: EventEligibility[] } {
  const { participant, events, tournamentRecord } = params ?? {};

  if (!participant?.participantId) return { error: MISSING_PARTICIPANT };
  if (!Array.isArray(events)) return { error: MISSING_EVENT };

  const eventEligibility = events.map((event) => {
    const result = getParticipantEligibility({ participant, event, tournamentRecord });
    if (result.error || result.eligible === undefined) {
      return {
        eventId: event?.eventId,
        eligible: false,
        indeterminate: true,
        rejectionReasons: [],
      } as EventEligibility;
    }
    return {
      eventId: event.eventId,
      eligible: result.eligible,
      indeterminate: !!result.indeterminate,
      rejectionReasons: result.rejectionReasons ?? [],
    };
  });

  return { eventEligibility };
}
