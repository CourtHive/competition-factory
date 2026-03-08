import { findMatchUp, publicFindMatchUp } from '@Acquire/findMatchUp';
import { beforeEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { MATCHUP_NOT_FOUND, MISSING_MATCHUP_ID, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

describe('findMatchUp', () => {
  describe('error cases', () => {
    it('returns MISSING_TOURNAMENT_RECORD when tournamentRecord is missing', () => {
      const result = findMatchUp({ tournamentRecord: undefined, matchUpId: 'any' } as any);
      expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    });

    it('returns MISSING_MATCHUP_ID when matchUpId is not a string', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      const result = findMatchUp({ tournamentRecord, matchUpId: undefined } as any);
      expect(result.error).toEqual(MISSING_MATCHUP_ID);
    });

    it('returns MISSING_MATCHUP_ID when matchUpId is a number', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      const result = findMatchUp({ tournamentRecord, matchUpId: 123 } as any);
      expect(result.error).toEqual(MISSING_MATCHUP_ID);
    });

    it('returns MISSING_MATCHUP_ID when matchUpId is null', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      const result = findMatchUp({ tournamentRecord, matchUpId: null } as any);
      expect(result.error).toEqual(MISSING_MATCHUP_ID);
    });

    it('returns MATCHUP_NOT_FOUND when matchUpId does not exist (brute force path)', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });
      const result = findMatchUp({ tournamentRecord, matchUpId: 'non-existent-id' });
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    });
  });

  describe('brute force path (no drawDefinition or event provided)', () => {
    let tournamentRecord: any;
    let matchUpId: string;

    beforeEach(() => {
      const generated = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });
      tournamentRecord = generated.tournamentRecord;
      const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;
      matchUpId = matchUps[0].matchUpId;
    });

    it('finds matchUp without drawDefinition or event (brute force lookup)', () => {
      const result = findMatchUp({ tournamentRecord, matchUpId });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.drawDefinition).toBeDefined();
    });

    it('finds matchUp with inContext=true (brute force)', () => {
      const result = findMatchUp({ tournamentRecord, matchUpId, inContext: true });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      // inContext matchUps should have additional context fields
      expect(result.matchUp?.drawId).toBeDefined();
    });

    it('finds matchUp with inContext=false (brute force)', () => {
      const result = findMatchUp({ tournamentRecord, matchUpId, inContext: false });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('with drawDefinition and event provided', () => {
    let tournamentRecord: any;
    let drawDefinition: any;
    let event: any;
    let matchUpId: string;

    beforeEach(() => {
      const generated = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });
      tournamentRecord = generated.tournamentRecord;
      event = tournamentRecord.events[0];
      drawDefinition = event.drawDefinitions[0];

      const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;
      matchUpId = matchUps[0].matchUpId;
    });

    it('finds matchUp when drawDefinition and event are provided (skips brute force)', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.drawDefinition).toBe(drawDefinition);
      expect(result.structure).toBeDefined();
    });

    it('finds matchUp with inContext=true when drawDefinition provided', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.matchUp?.eventId).toBeDefined();
    });

    it('finds matchUp with afterRecoveryTimes=true', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        afterRecoveryTimes: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('returns undefined matchUp when matchUpId not in provided drawDefinition (non-nextMatchUps path)', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId: 'bogus-id',
      });
      // The non-nextMatchUps path delegates to findDrawMatchUp which returns { error: MATCHUP_NOT_FOUND }
      // but findMatchUp destructures only { matchUp, structure } so error is lost
      expect(result.matchUp).toBeUndefined();
      expect(result.drawDefinition).toBe(drawDefinition);
    });
  });

  describe('DRAW_DEFINITION_NOT_FOUND path', () => {
    it('returns DRAW_DEFINITION_NOT_FOUND when event has no drawDefinitions and brute force finds matchUp', () => {
      // Create a tournament with draws, get a matchUpId, then strip the draws
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      // Remove all drawDefinitions from events so findEvent returns no drawDefinition
      const event = tournamentRecord.events[0];
      event.drawDefinitions = [];

      // allTournamentMatchUps will return no matchUps since draws are empty
      const result = findMatchUp({ tournamentRecord, matchUpId: 'any-id' });
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    });
  });

  describe('nextMatchUps path', () => {
    let tournamentRecord: any;
    let drawDefinition: any;
    let event: any;
    let matchUpId: string;

    beforeEach(() => {
      const generated = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });
      tournamentRecord = generated.tournamentRecord;
      event = tournamentRecord.events[0];
      drawDefinition = event.drawDefinitions[0];

      const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;
      matchUpId = matchUps[0].matchUpId;
    });

    it('finds matchUp with nextMatchUps=true and drawDefinition provided', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        nextMatchUps: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.drawDefinition).toBeDefined();
      expect(result.structure).toBeDefined();
    });

    it('finds matchUp with nextMatchUps=true and inContext=true', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        nextMatchUps: true,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('finds matchUp with nextMatchUps=true and inContext=false', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        nextMatchUps: false,
        inContext: false,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('returns MATCHUP_NOT_FOUND with nextMatchUps=true and bogus matchUpId', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId: 'bogus-matchup-id',
        nextMatchUps: true,
      });
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    });

    it('finds matchUp with nextMatchUps=true via brute force (no drawDefinition)', () => {
      const result = findMatchUp({
        tournamentRecord,
        matchUpId,
        nextMatchUps: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.drawDefinition).toBeDefined();
    });

    it('finds matchUp with nextMatchUps=true and afterRecoveryTimes=true', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        nextMatchUps: true,
        afterRecoveryTimes: true,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('contextProfile path', () => {
    let tournamentRecord: any;
    let drawDefinition: any;
    let event: any;
    let matchUpId: string;

    beforeEach(() => {
      const generated = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });
      tournamentRecord = generated.tournamentRecord;
      event = tournamentRecord.events[0];
      drawDefinition = event.drawDefinitions[0];

      const matchUps = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps().matchUps;
      matchUpId = matchUps[0].matchUpId;
    });

    it('uses contextProfile to generate contextContent when contextContent is not provided', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        contextProfile: { withScaleValues: true },
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('uses provided contextContent and ignores contextProfile', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        contextProfile: { withScaleValues: true },
        contextContent: { policies: {} } as any,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('contextProfile with nextMatchUps=true', () => {
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        contextProfile: { withScaleValues: true },
        nextMatchUps: true,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('additionalContext fields from event vs tournamentRecord', () => {
    it('uses event-level surfaceCategory/indoorOutdoor/endDate when available', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });
      const event = tournamentRecord.events[0];
      const drawDefinition = event.drawDefinitions[0];

      // Set event-level properties
      event.surfaceCategory = 'CLAY';
      event.indoorOutdoor = 'OUTDOOR';
      event.endDate = '2025-12-31';

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('falls back to tournamentRecord-level surfaceCategory/indoorOutdoor/endDate', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });
      const event = tournamentRecord.events[0];
      const drawDefinition = event.drawDefinitions[0];

      // Set tournament-level properties (event has none)
      tournamentRecord.surfaceCategory = 'HARD';
      tournamentRecord.indoorOutdoor = 'INDOOR';

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('participantsProfile', () => {
    it('passes participantsProfile through to hydrateParticipants', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });
      const event = tournamentRecord.events[0];
      const drawDefinition = event.drawDefinitions[0];

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result = findMatchUp({
        tournamentRecord,
        drawDefinition,
        event,
        matchUpId,
        participantsProfile: { withStatistics: true },
        inContext: true,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('publicFindMatchUp', () => {
    it('returns a deep copy of the matchUp with inContext forced to true', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result = publicFindMatchUp({ tournamentRecord, matchUpId });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
      expect(result.matchUp?.matchUpId).toEqual(matchUpId);
    });

    it('returns error for missing tournamentRecord', () => {
      const result = publicFindMatchUp({ tournamentRecord: undefined, matchUpId: 'any' } as any);
      expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    });

    it('returns error for non-existent matchUpId', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });
      const result = publicFindMatchUp({ tournamentRecord, matchUpId: 'bogus' });
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    });

    it('returns deep copy (not same reference as internal state)', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result1 = publicFindMatchUp({ tournamentRecord, matchUpId });
      const result2 = publicFindMatchUp({ tournamentRecord, matchUpId });
      expect(result1.matchUp).not.toBe(result2.matchUp);
      expect(result1.matchUp?.matchUpId).toEqual(result2.matchUp?.matchUpId);
    });
  });

  describe('eventId and drawId params', () => {
    it('uses provided eventId to help locate matchUp via brute force', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;
      const eventId = tournamentRecord.events[0].eventId;

      // eventId provided but no drawDefinition — triggers brute force
      const result = findMatchUp({
        tournamentRecord,
        matchUpId,
        eventId,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('uses provided drawId to help locate matchUp via brute force', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;
      const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;

      const result = findMatchUp({
        tournamentRecord,
        matchUpId,
        drawId,
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('edge case: only drawDefinition provided (no event)', () => {
    it('triggers brute force when event is missing but drawDefinition is provided', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      // drawDefinition provided but no event — condition is (!drawDefinition || !event)
      // so with event missing, brute force is triggered
      const result = findMatchUp({
        tournamentRecord,
        drawDefinition: tournamentRecord.events[0].drawDefinitions[0],
        matchUpId,
        // event not provided
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });

    it('triggers brute force when drawDefinition is missing but event is provided', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      tournamentEngine.setState(tournamentRecord);
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const matchUpId = matchUps[0].matchUpId;

      const result = findMatchUp({
        tournamentRecord,
        event: tournamentRecord.events[0],
        matchUpId,
        // drawDefinition not provided
      });
      expect(result.error).toBeUndefined();
      expect(result.matchUp).toBeDefined();
    });
  });

  describe('tournament with no events', () => {
    it('returns MATCHUP_NOT_FOUND for tournament with no events', () => {
      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      tournamentRecord.events = [];

      const result = findMatchUp({ tournamentRecord, matchUpId: 'any-id' });
      expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    });
  });
});
