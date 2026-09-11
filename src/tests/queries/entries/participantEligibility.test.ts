import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { getParticipantEligibility, getEligibleEvents } from '@Query/entries/getParticipantEligibility';
import { validateParticipantRating } from '@Query/entries/categoryValidation';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ANY } from '@Constants/genderConstants';

/**
 * Punch-list M3 and M4.
 *
 * The eligibility predicate was complete and tested, and reachable only by ATTEMPTING an entry.
 * These tests cover the read-only query built on it, and — the part that matters most — pin the
 * one place where the query and the mutation deliberately disagree.
 */

const seedU18 = ({ birthDate, birthYear }: { birthDate?: string; birthYear?: number } = {}) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        category: { categoryName: 'U18', ageMax: 17 },
        eventName: 'U18 Singles',
        eventType: SINGLES_EVENT,
        gender: ANY,
      },
    ],
    participantsProfile: { participantsCount: 4 },
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    nonRandom: 1,
  });

  const participant = tournamentRecord.participants.find((p: any) => p.participantType === INDIVIDUAL);
  delete participant.person.birthDate;
  if (birthDate) participant.person.birthDate = birthDate;
  if (birthYear) participant.person.birthYear = birthYear;

  tournamentEngine.setState(tournamentRecord);
  return { tournamentRecord, participant, event: tournamentRecord.events[0] };
};

describe('getParticipantEligibility', () => {
  it('reports eligible for a participant inside the age range', () => {
    const { tournamentRecord, participant, event } = seedU18({ birthDate: '2010-03-04' });
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(true);
    expect(result.indeterminate).toBe(false);
    expect(result.rejectionReasons).toEqual([]);
  });

  it('reports INELIGIBLE — not indeterminate — for a real age breach', () => {
    const { tournamentRecord, participant, event } = seedU18({ birthDate: '2000-03-04' });
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(false);
    expect(result.indeterminate).toBe(false);
    expect(result.rejectionReasons[0].type).toBe('age');
  });

  it('reports INDETERMINATE when the birth date is unknown', () => {
    const { tournamentRecord, participant, event } = seedU18();
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(false);
    expect(result.indeterminate).toBe(true);
    expect(result.rejectionReasons[0].indeterminate).toBe(true);
    expect(result.rejectionReasons[0].reason).toContain('Missing birthDate');
  });

  it('an event with no category restricts nobody', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventName: 'Open', eventType: SINGLES_EVENT, gender: ANY }],
      participantsProfile: { participantsCount: 2 },
      nonRandom: 1,
    });
    const participant = tournamentRecord.participants.find((p: any) => p.participantType === INDIVIDUAL);
    const event = tournamentRecord.events[0];
    delete event.category;
    const result: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(true);
    expect(result.indeterminate).toBe(false);
  });

  it('is reachable through the engine and mutates nothing', () => {
    const { tournamentRecord, participant, event } = seedU18({ birthDate: '2010-03-04' });
    const before = JSON.stringify(tournamentRecord);
    const result: any = tournamentEngine.getParticipantEligibility({ participant, event, tournamentRecord });
    expect(result.eligible).toBe(true);
    expect(JSON.stringify(tournamentRecord)).toEqual(before);
  });
});

/**
 * D1 — the deliberate divergence.
 *
 * "We cannot tell" is correctly a refusal when WRITING an entry and correctly not a refusal when
 * ANSWERING a question. Both halves are asserted against the same participant so the asymmetry
 * reads as intentional rather than as a bug somebody should reconcile.
 *
 * NOTE what the first test establishes, because it corrects an assumption this work was planned on:
 * `addEventEntries` does NOT check categories by default. `enforceCategory` defaults to FALSE, so
 * the unfiltered path enters anyone. The divergence only exists on the opt-in path — which is where
 * it matters, and which is what the second test pins.
 */
describe('unknown birthDate: the query and the mutation deliberately disagree', () => {
  it('addEventEntries does not enforce category by default — it enters the participant', () => {
    const { participant, event } = seedU18();

    tournamentEngine.addEventEntries({
      participantIds: [participant.participantId],
      eventId: event.eventId,
    });

    const { event: updated }: any = tournamentEngine.getEvent({ eventId: event.eventId });
    const entered = (updated.entries ?? []).some((e: any) => e.participantId === participant.participantId);
    expect(entered).toBe(true);
  });

  it('with enforceCategory, the query says indeterminate while the mutation still rejects', () => {
    const { tournamentRecord, participant, event } = seedU18();

    const eligibility: any = getParticipantEligibility({ participant, event, tournamentRecord });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.indeterminate).toBe(true);

    // Same participant, same event, through the mutation: still filtered out, exactly as before.
    const result: any = tournamentEngine.addEventEntries({
      participantIds: [participant.participantId],
      eventId: event.eventId,
      enforceCategory: true,
    });

    const { event: updated }: any = tournamentEngine.getEvent({ eventId: event.eventId });
    const entered = (updated.entries ?? []).some((e: any) => e.participantId === participant.participantId);
    expect(entered).toBe(false);

    // The rejection is reported on `context`, and it carries the SAME `indeterminate` flag the
    // query keys off — one predicate, two policies, not two implementations.
    const rejections = result.context?.categoryRejections ?? [];
    expect(rejections.length).toBeGreaterThan(0);
    expect(rejections[0].rejectionReasons[0].indeterminate).toBe(true);
  });
});

describe('getEligibleEvents', () => {
  it('answers across events and never silently drops one', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { category: { categoryName: 'U18', ageMax: 17 }, eventName: 'U18', eventType: SINGLES_EVENT, gender: ANY },
        { category: { categoryName: 'O30', ageMin: 30 }, eventName: 'O30', eventType: SINGLES_EVENT, gender: ANY },
      ],
      participantsProfile: { participantsCount: 4 },
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      nonRandom: 1,
    });
    const participant = tournamentRecord.participants.find((p: any) => p.participantType === INDIVIDUAL);
    participant.person.birthDate = '2010-03-04';
    tournamentEngine.setState(tournamentRecord);

    const result: any = getEligibleEvents({ participant, events: tournamentRecord.events, tournamentRecord });
    expect(result.eventEligibility).toHaveLength(2);

    const u18 = result.eventEligibility.find((e: any) => e.eventId === tournamentRecord.events[0].eventId);
    const o30 = result.eventEligibility.find((e: any) => e.eventId === tournamentRecord.events[1].eventId);
    expect(u18.eligible).toBe(true);
    expect(o30.eligible).toBe(false);
    expect(o30.indeterminate).toBe(false);
  });
});

/**
 * M4 — a combined bound constrains the PAIR, so an individual cannot be measured against it.
 * Before this change a combined-7.0 category rejected the 4.0 half of a legal 3.0 + 4.0 pair.
 */
describe('combined rating categories', () => {
  const event: any = { eventId: 'e', eventType: 'DOUBLES' };

  it('does not reject an individual against a combined-only bound', () => {
    const participant: any = { participantId: 'p', person: {} };
    const category: any = { ratingType: 'NTRP', combinedRatingMax: 7.0 };
    expect(validateParticipantRating(participant, category, event).valid).toBe(true);
  });

  it('still enforces an individual bound stated alongside a combined one', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
      nonRandom: 1,
    });
    const participant = tournamentRecord.participants.find((p: any) => p.participantType === INDIVIDUAL);
    // No NTRP scale item exists for this participant, so an individual bound is INDETERMINATE
    // rather than satisfied — which is itself the point: the combined bound did not suppress it.
    const category: any = { ratingType: 'NTRP', combinedRatingMax: 7.0, ratingMax: 5.0 };
    const result: any = validateParticipantRating(participant, category, event as any, tournamentRecord);
    expect(result.valid).toBe(false);
    expect(result.indeterminate).toBe(true);
  });
});
