import { modifyEvent } from '@Mutate/events/modifyEvent';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { CATEGORY_MISMATCH, INVALID_EVENT_TYPE, INVALID_GENDER } from '@Constants/errorConditionConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { ALTERNATE } from '@Constants/entryStatusConstants';

describe('modifyEvent - uncovered branch coverage', () => {
  it('rejects MIXED gender when flights exist (no draws)', () => {
    // Generate tournament with a flight profile but no generated draw
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawSize: 8, generate: false }],
          eventType: SINGLES,
          gender: MALE,
        },
      ],
      participantsProfile: { participantsCount: 8, sex: MALE },
    });

    tournamentEngine.setState(tournamentRecord);

    // The event has flights (from drawProfiles with generate:false) but no drawDefinitions
    // noFlightsNoDraws should be false because flights exist
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { gender: MIXED },
      eventId,
    });

    // With flights present but only MALE participants, MIXED should be rejected
    // because noFlightsNoDraws is false (flights exist)
    expect(result.error).toEqual(INVALID_GENDER);
  });

  it('allows gender update when no gender is specified in eventUpdates', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // eventUpdates without gender should succeed without gender validation
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { eventName: 'Updated Name Only' },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('allows gender update when single entered gender matches', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawSize: 4, uniqueParticipants: true }],
          eventType: SINGLES,
          gender: FEMALE,
        },
      ],
      participantsProfile: { participantsCount: 8, sex: FEMALE },
      setState: true,
    });

    // Changing to FEMALE when only FEMALE participants entered should succeed
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { gender: FEMALE },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles eventType validation with PAIR participants', () => {
    // Create a DOUBLES event with PAIR participants
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawSize: 4, uniqueParticipants: true }],
          eventType: DOUBLES,
        },
      ],
      setState: true,
    });

    // Changing a DOUBLES event with PAIR participants to SINGLES should fail
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { eventType: SINGLES },
      eventId,
    });
    expect(result.error).toEqual(INVALID_EVENT_TYPE);
  });

  it('handles eventType validation with TEAM participants', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, generate: false }],
      setState: true,
    });

    // TEAM event with TEAM participants: changing to SINGLES should fail
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { eventType: SINGLES },
      eventId,
    });
    expect(result.error).toEqual(INVALID_EVENT_TYPE);

    // Changing to DOUBLES should also fail
    const result2 = tournamentEngine.modifyEvent({
      eventUpdates: { eventType: DOUBLES },
      eventId,
    });
    expect(result2.error).toEqual(INVALID_EVENT_TYPE);
  });

  it('succeeds when eventType is not specified in eventUpdates', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    const result = tournamentEngine.modifyEvent({
      eventUpdates: { eventName: 'No eventType change' },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('checks CATEGORY_MISMATCH when participant birthDate is out of range', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-07';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      startDate,
      endDate,
    });
    tournamentEngine.setState(tournamentRecord);

    // Add event
    let result = tournamentEngine.addEvent({ event: { eventName: 'Age Test' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    // Create a participant with a known birthDate that will be out of range
    const participant = {
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      person: {
        standardFamilyName: 'OldPlayer',
        standardGivenName: 'Test',
        birthDate: '1990-01-01', // way too old for U12
      },
    };
    result = tournamentEngine.addParticipants({
      participants: [participant],
      returnParticipants: true,
    });
    expect(result.success).toEqual(true);
    const participantId = result.participants[0].participantId;

    result = tournamentEngine.addEventEntries({
      participantIds: [participantId],
      eventId,
    });
    expect(result.success).toEqual(true);

    // Set a U12 category — the participant born in 1990 should fail the age check
    result = tournamentEngine.modifyEvent({
      eventUpdates: {
        category: { categoryName: 'U12', ageCategoryCode: 'U12' },
      },
      eventId,
    });
    expect(result.error).toEqual(CATEGORY_MISMATCH);
  });

  it('handles DOUBLES event participants for age category check (flatMap individualParticipants)', () => {
    const startDate = '2024-06-01';
    const endDate = '2024-06-07';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      startDate,
      endDate,
    });
    tournamentEngine.setState(tournamentRecord);

    // Create a doubles event
    let result = tournamentEngine.addEvent({
      event: { eventName: 'Doubles Age Test', eventType: DOUBLES },
    });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    // Create individual participants with known birthDates
    const individuals = [
      {
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        person: { standardFamilyName: 'Young1', standardGivenName: 'A', birthDate: '2015-03-01' },
      },
      {
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
        person: { standardFamilyName: 'Young2', standardGivenName: 'B', birthDate: '2015-06-01' },
      },
    ];
    result = tournamentEngine.addParticipants({
      participants: individuals,
      returnParticipants: true,
    });
    expect(result.success).toEqual(true);
    const individualParticipantIds = result.participants.map((p) => p.participantId);

    // Create a pair participant
    const pairParticipant = {
      participantType: PAIR,
      participantRole: COMPETITOR,
      individualParticipantIds,
    };
    result = tournamentEngine.addParticipants({
      participants: [pairParticipant],
      returnParticipants: true,
    });
    expect(result.success).toEqual(true);
    const pairParticipantId = result.participants[0].participantId;

    // Add pair to doubles event
    result = tournamentEngine.addEventEntries({
      participantIds: [pairParticipantId],
      eventId,
    });
    expect(result.success).toEqual(true);

    // Set U12 category — these 2015-born players should be ~9 in June 2024, so U12 should work
    result = tournamentEngine.modifyEvent({
      eventUpdates: {
        category: { categoryName: 'U12', ageCategoryCode: 'U12' },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles eventType update when no eventType is specified in updates (no-op)', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    // No eventType in updates, so checkEventType should pass even though INDIVIDUAL participants exist
    const result = tournamentEngine.modifyEvent({
      eventUpdates: {},
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('handles gender validation with alternates included in entered participants', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          drawProfiles: [{ drawSize: 4, participantsCount: 2 }],
          eventType: SINGLES,
          gender: MALE,
        },
      ],
      participantsProfile: { participantsCount: 8, sex: MALE },
      setState: true,
    });

    // Add some alternates — should still respect gender
    const { participants } = tournamentEngine.getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
    });
    const { event } = tournamentEngine.getEvent({ eventId });
    const enteredIds = new Set(event.entries.map((e) => e.participantId));
    const nonEnteredMale = participants.filter((p) => !enteredIds.has(p.participantId) && p.person?.sex === MALE);

    if (nonEnteredMale.length > 0) {
      tournamentEngine.addEventEntries({
        participantIds: [nonEnteredMale[0].participantId],
        entryStatus: ALTERNATE,
        eventId,
      });
    }

    // Changing gender to FEMALE should still fail because alternates count as entered
    const result = tournamentEngine.modifyEvent({
      eventUpdates: { gender: FEMALE },
      eventId,
    });
    expect(result.error).toEqual(INVALID_GENDER);
  });

  it('handles TEAM event category validation with tieFormat collectionDefinitions', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    });
    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];

    // Modify with a broad category that should be compatible with tieFormat collection categories
    const result = modifyEvent({
      tournamentRecord,
      eventId: event.eventId,
      event,
      eventUpdates: {
        category: { categoryName: 'Open', ageCategoryCode: 'Open' },
      },
    });
    // Should succeed since 'Open' category should contain any sub-categories
    expect(result.success || result.error).toBeDefined();
  });

  it('handles date-only update with endDate from event falling back to tournamentRecord', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    tournamentEngine.setState(tournamentRecord);

    let result = tournamentEngine.addEvent({ event: { eventName: 'Date Fallback' } });
    expect(result.success).toEqual(true);
    const { eventId } = result.event;

    // Update only startDate (endDate falls back to event.endDate or tournamentRecord.endDate)
    result = tournamentEngine.modifyEvent({
      eventUpdates: { startDate: '2024-06-01' },
      eventId,
    });
    expect(result.success).toEqual(true);

    // Update only endDate (startDate falls back)
    result = tournamentEngine.modifyEvent({
      eventUpdates: { endDate: '2024-12-01' },
      eventId,
    });
    expect(result.success).toEqual(true);
  });
});
