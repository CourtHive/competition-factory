import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { COMPETITOR } from '@Constants/participantRoles';

describe('Category Validation in addEventEntries', () => {
  describe('Age Validation', () => {
    it('accepts participants within age range throughout event', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      // Create participant who is 15-16 during event (valid for U18)
      const participant = {
        participantId: 'p-valid-age',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2008-06-15', // Will be 16 during event
          standardGivenName: 'John',
          standardFamilyName: 'Doe',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U18 Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Under 18',
          ageMax: 17,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      expect(result.success).toEqual(true);
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });

    it('rejects participants who age out during event', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-20',
      });

      // Participant turns 18 on August 10 (during event)
      const participant = {
        participantId: 'p-ages-out',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2006-08-10',
          standardGivenName: 'Jane',
          standardFamilyName: 'Smith',
          sex: 'FEMALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U18 Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Under 18',
          ageMax: 17,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
      expect(result.context.categoryRejections.length).toEqual(1);

      const rejection = result.context.categoryRejections[0];
      expect(rejection.participantId).toEqual(participant.participantId);
      expect(rejection.participantName).toEqual('Jane Smith');
      expect(rejection.rejectionReasons.length).toEqual(1);
      expect(rejection.rejectionReasons[0].type).toEqual('age');
      expect(rejection.rejectionReasons[0].reason).toContain('Age 18');
      expect(rejection.rejectionReasons[0].reason).toContain('outside range');
    });

    it('rejects participants too young at event start', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-too-young',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2015-01-01', // Age 9 during event
          standardGivenName: 'Kid',
          standardFamilyName: 'Young',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Adult Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Adults',
          ageMin: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('age');
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.ageAtStart).toEqual(9);
    });

    it('rejects participants with missing birthDate when age restrictions exist', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-no-birthdate',
        participantType: INDIVIDUAL,
        person: {
          standardGivenName: 'No',
          standardFamilyName: 'Birthday',
          sex: 'MALE',
          // birthDate missing
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U18 Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Under 18',
          ageMax: 17,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons[0].reason).toContain('Missing birthDate');
    });

    it('accepts participants when no age restrictions', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-any-age',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'Any',
          standardFamilyName: 'Age',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Open Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Open',
          // No age restrictions
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });

    it('validates age with both ageMin and ageMax', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const validParticipant = {
        participantId: 'p-valid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2010-01-01', // Age 14
          standardGivenName: 'Valid',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      const tooYoung = {
        participantId: 'p-too-young',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2016-01-01', // Age 8
          standardGivenName: 'Too',
          standardFamilyName: 'Young',
          sex: 'MALE',
        },
      };

      const tooOld = {
        participantId: 'p-too-old',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2005-01-01', // Age 19
          standardGivenName: 'Too',
          standardFamilyName: 'Old',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [validParticipant, tooYoung, tooOld];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Juniors 12-18',
        eventType: SINGLES,
        category: {
          categoryName: 'Juniors',
          ageMin: 12,
          ageMax: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // Try to add all three
      result = tournamentEngine.addEventEntries({
        participantIds: [validParticipant.participantId, tooYoung.participantId, tooOld.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(2);

      const rejectedIds = result.context.categoryRejections.map((r) => r.participantId);
      expect(rejectedIds).toContain(tooYoung.participantId);
      expect(rejectedIds).toContain(tooOld.participantId);
      expect(rejectedIds).not.toContain(validParticipant.participantId);
    });

    it('validates age using ageCategoryCode when ageMin/ageMax not provided', () => {
      const { tournamentRecord} = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const validParticipant = {
        participantId: 'p-valid-18o',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '1990-01-01', // Age 34 - valid for 18O (18+)
          standardGivenName: 'Valid',
          standardFamilyName: 'Adult',
          sex: 'MALE',
        },
      };

      const invalidParticipant = {
        participantId: 'p-invalid-18o',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2010-01-01', // Age 14 - invalid for 18O (18+)
          standardGivenName: 'Too',
          standardFamilyName: 'Young',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [validParticipant, invalidParticipant];
      tournamentEngine.setState(tournamentRecord);

      // Category with only ageCategoryCode, no explicit ageMin/ageMax
      const event = {
        eventName: '18 and Over Singles',
        eventType: SINGLES,
        category: {
          ageCategoryCode: '18O',
          // No ageMin or ageMax specified
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // Try to add both participants
      result = tournamentEngine.addEventEntries({
        participantIds: [validParticipant.participantId, invalidParticipant.participantId],
        enforceCategory: true,
        eventId,
      });

      // Should reject the invalid participant
      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].participantId).toEqual(invalidParticipant.participantId);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('age');
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.requiredMin).toEqual(18);
    });

    it('validates age using U18 ageCategoryCode when ageMin/ageMax not provided', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const validParticipant = {
        participantId: 'p-valid-u18',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2008-01-01', // Age 16 - valid for U18
          standardGivenName: 'Valid',
          standardFamilyName: 'Junior',
          sex: 'MALE',
        },
      };

      const invalidParticipant = {
        participantId: 'p-invalid-u18',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01', // Age 24 - invalid for U18
          standardGivenName: 'Too',
          standardFamilyName: 'Old',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [validParticipant, invalidParticipant];
      tournamentEngine.setState(tournamentRecord);

      // Category with only ageCategoryCode, no explicit ageMin/ageMax
      const event = {
        eventName: 'Under 18 Singles',
        eventType: SINGLES,
        category: {
          ageCategoryCode: 'U18',
          // No ageMin or ageMax specified
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // Try to add both participants
      result = tournamentEngine.addEventEntries({
        participantIds: [validParticipant.participantId, invalidParticipant.participantId],
        enforceCategory: true,
        eventId,
      });

      // Should reject the invalid participant
      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].participantId).toEqual(invalidParticipant.participantId);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('age');
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.requiredMax).toEqual(17);
    });

    it('skips age validation for combined age categories (C##-##)', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      // Participant who would be invalid for individual age check
      const youngParticipant = {
        participantId: 'p-young',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2015-01-01', // Age 9 - would fail normal age check
          standardGivenName: 'Young',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      const oldParticipant = {
        participantId: 'p-old',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '1960-01-01', // Age 64 - valid for combined 50-70
          standardGivenName: 'Old',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [youngParticipant, oldParticipant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Combined 50-70',
        eventType: SINGLES,
        category: {
          ageCategoryCode: 'C50-70', // Combined age category
          ageMin: 50,
          ageMax: 70,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // With combined category, both should be accepted (validation skipped for individuals)
      result = tournamentEngine.addEventEntries({
        participantIds: [youngParticipant.participantId, oldParticipant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(2);
      // No category rejections because combined categories skip individual age validation
      expect(result.context?.categoryRejections).toBeUndefined();
    });
  });

  describe('Rating Validation', () => {
    it('accepts participants with valid rating', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-valid-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'Good',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      // Add WTN rating
      tournamentEngine.setParticipantScaleItem({
        participantId: participant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 10.5,
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Intermediate Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Intermediate',
          ratingType: 'WTN',
          ratingMin: 9,
          ratingMax: 12,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });

    it('rejects participants with rating too low', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-low-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'Low',
          standardFamilyName: 'Rated',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      tournamentEngine.setParticipantScaleItem({
        participantId: participant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 8,
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Advanced Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Advanced',
          ratingType: 'WTN',
          ratingMin: 9,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('rating');
      expect(result.context.categoryRejections[0].rejectionReasons[0].reason).toContain('below minimum');
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.ratingValue).toEqual(8);
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.requiredMin).toEqual(9);
    });

    it('rejects participants with rating too high', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-high-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'High',
          standardFamilyName: 'Rated',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      tournamentEngine.setParticipantScaleItem({
        participantId: participant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 13,
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Beginner Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Beginner',
          ratingType: 'WTN',
          ratingMax: 12,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('rating');
      expect(result.context.categoryRejections[0].rejectionReasons[0].reason).toContain('above maximum');
    });

    it('rejects participants with missing rating', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-no-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'No',
          standardFamilyName: 'Rating',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      // No rating added

      const event = {
        eventName: 'Rated Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Rated',
          ratingType: 'WTN',
          ratingMin: 9,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons[0].reason).toContain('Missing WTN rating');
    });

    it('accepts participants when no rating restrictions', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-any-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'Any',
          standardFamilyName: 'Rating',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Open Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Open',
          // No rating restrictions
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });
  });

  describe('Combined Validation', () => {
    it('rejects participants failing both age and rating', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-double-fail',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2016-01-01', // Too young (age 8)
          standardGivenName: 'Double',
          standardFamilyName: 'Fail',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      tournamentEngine.setParticipantScaleItem({
        participantId: participant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 7, // Too low
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Junior Advanced',
        eventType: SINGLES,
        category: {
          categoryName: 'Junior Advanced',
          ageMin: 12,
          ageMax: 18,
          ratingType: 'WTN',
          ratingMin: 9,
          ratingMax: 12,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].rejectionReasons.length).toEqual(2);

      const reasons = result.context.categoryRejections[0].rejectionReasons;
      const ageReason = reasons.find((r) => r.type === 'age');
      const ratingReason = reasons.find((r) => r.type === 'rating');

      expect(ageReason).toBeDefined();
      expect(ratingReason).toBeDefined();
    });

    it('adds valid participants and rejects invalid ones', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const validParticipant = {
        participantId: 'p-valid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2010-01-01', // Age 14
          standardGivenName: 'Valid',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      const invalidParticipant = {
        participantId: 'p-invalid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-01-01', // Age 4 - too young
          standardGivenName: 'Invalid',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [validParticipant, invalidParticipant];
      tournamentEngine.setState(tournamentRecord);

      // Add ratings for both
      tournamentEngine.setParticipantScaleItem({
        participantId: validParticipant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 10,
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      tournamentEngine.setParticipantScaleItem({
        participantId: invalidParticipant.participantId,
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 10,
          eventType: SINGLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Junior Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Juniors',
          ageMin: 12,
          ageMax: 18,
          ratingType: 'WTN',
          ratingMin: 9,
          ratingMax: 12,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [validParticipant.participantId, invalidParticipant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].participantId).toEqual(invalidParticipant.participantId);
    });
  });

  describe('Age Eligibility Scenarios', () => {
    it('rejects a 25-year-old entering a U14 event', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-adult-in-u14',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '1999-03-15', // Age 25 during event
          standardGivenName: 'Adult',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U14 Singles',
        eventType: SINGLES,
        category: {
          ageCategoryCode: 'U14',
        },
      };

      let result: any = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections.length).toEqual(1);
      expect(result.context.categoryRejections[0].participantId).toEqual(participant.participantId);
      expect(result.context.categoryRejections[0].rejectionReasons[0].type).toEqual('age');
      expect(result.context.categoryRejections[0].rejectionReasons[0].details.requiredMax).toEqual(13);
    });
  });

  describe('Enforcement Parameter', () => {
    it('does not validate when enforceCategory is false', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-invalid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-01-01', // Age 4 - too young
          standardGivenName: 'Invalid',
          standardFamilyName: 'Age',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Junior Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Juniors',
          ageMin: 12,
          ageMax: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // With enforceCategory: false (or omitted), should succeed
      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: false,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });

    it('validates when enforceCategory is true', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-invalid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-01-01', // Age 4 - too young
          standardGivenName: 'Invalid',
          standardFamilyName: 'Age',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Junior Singles',
        eventType: SINGLES,
        category: {
          categoryName: 'Juniors',
          ageMin: 12,
          ageMax: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // With enforceCategory: true, should fail
      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
    });

    it('does not validate when event has no category', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-any',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-01-01',
          standardGivenName: 'Any',
          standardFamilyName: 'Age',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Open Singles',
        eventType: SINGLES,
        // No category
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      // Even with enforceCategory: true, should succeed if no category exists
      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
      expect(result.addedEntriesCount).toEqual(1);
    });
  });

  describe('Rejection Details', () => {
    it('includes participant name in rejection', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-named',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-01-01',
          standardGivenName: 'FirstName',
          standardFamilyName: 'LastName',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Junior Singles',
        eventType: SINGLES,
        category: {
          ageMin: 12,
          ageMax: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections[0].participantName).toEqual('FirstName LastName');
    });

    it('includes detailed rejection information', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const participant = {
        participantId: 'p-details',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2020-06-15',
          standardGivenName: 'Test',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      tournamentRecord.participants = [participant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Junior Singles',
        eventType: SINGLES,
        category: {
          ageMin: 12,
          ageMax: 18,
        },
      };

      let result = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntries({
        participantIds: [participant.participantId],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      const rejection = result.context.categoryRejections[0];
      const reason = rejection.rejectionReasons[0];

      expect(reason.details.birthDate).toEqual('2020-06-15');
      expect(reason.details.ageAtStart).toBeDefined();
      expect(reason.details.ageAtEnd).toBeDefined();
      expect(reason.details.requiredMin).toEqual(12);
      expect(reason.details.requiredMax).toEqual(18);
    });
  });

  describe('Paired Entry Category Validation', () => {
    it('rejects a PAIR entry where one member exceeds U14 age limit', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const validIndividual = {
        participantId: 'p-young-valid',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2012-01-01', // Age 12 - valid for U14
          standardGivenName: 'Young',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      const invalidIndividual = {
        participantId: 'p-too-old',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '1999-03-15', // Age 25 - invalid for U14
          standardGivenName: 'Old',
          standardFamilyName: 'Player',
          sex: 'MALE',
        },
      };

      const pairParticipant = {
        participantId: 'pair-1',
        participantType: PAIR,
        participantRole: COMPETITOR,
        individualParticipantIds: ['p-young-valid', 'p-too-old'],
      };

      tournamentRecord.participants = [validIndividual, invalidIndividual, pairParticipant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U14 Doubles',
        eventType: DOUBLES,
        category: {
          ageCategoryCode: 'U14',
        },
      };

      let result: any = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntryPairs({
        participantIdPairs: [['p-young-valid', 'p-too-old']],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
      expect(result.context.categoryRejections.length).toEqual(1);

      const rejection = result.context.categoryRejections[0];
      expect(rejection.rejectionReasons.length).toBeGreaterThanOrEqual(1);
      expect(rejection.rejectionReasons[0].type).toEqual('age');
      expect(rejection.rejectionReasons[0].reason).toContain('Old Player');
    });

    it('accepts a PAIR entry where both members are within U14 age limit', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const individual1 = {
        participantId: 'p-valid-1',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2012-01-01', // Age 12
          standardGivenName: 'Valid',
          standardFamilyName: 'One',
          sex: 'MALE',
        },
      };

      const individual2 = {
        participantId: 'p-valid-2',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2011-06-15', // Age 13
          standardGivenName: 'Valid',
          standardFamilyName: 'Two',
          sex: 'MALE',
        },
      };

      const pairParticipant = {
        participantId: 'pair-valid',
        participantType: PAIR,
        participantRole: COMPETITOR,
        individualParticipantIds: ['p-valid-1', 'p-valid-2'],
      };

      tournamentRecord.participants = [individual1, individual2, pairParticipant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'U14 Doubles',
        eventType: DOUBLES,
        category: {
          ageCategoryCode: 'U14',
        },
      };

      let result: any = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntryPairs({
        participantIdPairs: [['p-valid-1', 'p-valid-2']],
        enforceCategory: true,
        eventId,
      });

      expect(result.success).toEqual(true);
    });

    it('skips validation for combined age categories (C50-70) on pair entries', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const individual1 = {
        participantId: 'p-young-c',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01', // Age 24
          standardGivenName: 'Young',
          standardFamilyName: 'Partner',
          sex: 'MALE',
        },
      };

      const individual2 = {
        participantId: 'p-old-c',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '1960-01-01', // Age 64
          standardGivenName: 'Old',
          standardFamilyName: 'Partner',
          sex: 'MALE',
        },
      };

      const pairParticipant = {
        participantId: 'pair-combined',
        participantType: PAIR,
        participantRole: COMPETITOR,
        individualParticipantIds: ['p-young-c', 'p-old-c'],
      };

      tournamentRecord.participants = [individual1, individual2, pairParticipant];
      tournamentEngine.setState(tournamentRecord);

      const event = {
        eventName: 'Combined 50-70 Doubles',
        eventType: DOUBLES,
        category: {
          ageCategoryCode: 'C50-70',
          ageMin: 50,
          ageMax: 70,
        },
      };

      let result: any = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntryPairs({
        participantIdPairs: [['p-young-c', 'p-old-c']],
        enforceCategory: true,
        eventId,
      });

      // Combined age categories skip individual age validation
      expect(result.success).toEqual(true);
    });

    it('rejects a PAIR entry when one member rating exceeds category maximum', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        startDate: '2024-08-01',
        endDate: '2024-08-15',
      });

      const individual1 = {
        participantId: 'p-good-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'Good',
          standardFamilyName: 'Rating',
          sex: 'MALE',
        },
      };

      const individual2 = {
        participantId: 'p-high-rating',
        participantType: INDIVIDUAL,
        person: {
          birthDate: '2000-01-01',
          standardGivenName: 'High',
          standardFamilyName: 'Rating',
          sex: 'MALE',
        },
      };

      const pairParticipant = {
        participantId: 'pair-rating',
        participantType: PAIR,
        participantRole: COMPETITOR,
        individualParticipantIds: ['p-good-rating', 'p-high-rating'],
      };

      tournamentRecord.participants = [individual1, individual2, pairParticipant];
      tournamentEngine.setState(tournamentRecord);

      // Add ratings using DOUBLES eventType to match the event
      tournamentEngine.setParticipantScaleItem({
        participantId: 'p-good-rating',
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 10,
          eventType: DOUBLES,
          scaleDate: '2024-07-01',
        },
      });

      tournamentEngine.setParticipantScaleItem({
        participantId: 'p-high-rating',
        scaleItem: {
          scaleType: 'RATING',
          scaleName: 'WTN',
          scaleValue: 15,
          eventType: DOUBLES,
          scaleDate: '2024-07-01',
        },
      });

      const event = {
        eventName: 'Beginner Doubles',
        eventType: DOUBLES,
        category: {
          categoryName: 'Beginner',
          ratingType: 'WTN',
          ratingMax: 12,
        },
      };

      let result: any = tournamentEngine.addEvent({ event });
      const { eventId } = result.event;

      result = tournamentEngine.addEventEntryPairs({
        participantIdPairs: [['p-good-rating', 'p-high-rating']],
        enforceCategory: true,
        eventId,
      });

      expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
      expect(result.context.categoryRejections).toBeDefined();
      expect(result.context.categoryRejections.length).toEqual(1);

      const rejection = result.context.categoryRejections[0];
      expect(rejection.rejectionReasons.length).toBeGreaterThanOrEqual(1);

      const ratingReason = rejection.rejectionReasons.find((r: any) => r.type === 'rating');
      expect(ratingReason).toBeDefined();
      expect(ratingReason.reason).toContain('High Rating');
      expect(ratingReason.reason).toContain('above maximum');
    });
  });
});
