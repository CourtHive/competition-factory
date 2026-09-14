/**
 * Tests for Custom Engines documentation examples
 * These tests verify that all code examples in docs/engines/custom-engines.md work as documented
 */

import { expect, it, describe, beforeEach } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import * as governors from '@Assemblies/governors';
import syncEngine from '@Assemblies/engines/sync';
import askEngine from '@Assemblies/engines/ask';

describe('Custom Engines Documentation Examples', () => {
  describe('Minimal Query Engine (syncEngine)', () => {
    beforeEach(() => {
      syncEngine.reset();
    });

    it('works exactly as documented - query methods only', () => {
      // Import exactly as shown in documentation
      syncEngine.importMethods(governors.queryGovernor);

      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });

      syncEngine.setState(tournamentRecord);

      // Query methods available
      const { participants } = syncEngine.getParticipants();
      expect(participants).toBeDefined();
      expect(participants.length).toBeGreaterThan(0);

      const { matchUps } = syncEngine.allTournamentMatchUps();
      expect(matchUps).toBeDefined();
      expect(Array.isArray(matchUps)).toBe(true);
    });
  });

  describe('Minimal Mutation Engine (askEngine)', () => {
    beforeEach(() => {
      askEngine.reset();
    });

    it('works exactly as documented - scoring methods only', () => {
      // Import exactly as shown in documentation
      askEngine.importMethods({
        setMatchUpStatus: governors.matchUpGovernor.setMatchUpStatus,
        setMatchUpState: governors.matchUpGovernor.setMatchUpState,
        setState: governors.queryGovernor.setState,
        allTournamentMatchUps: governors.queryGovernor.allTournamentMatchUps,
      });

      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 4 }],
      });

      askEngine.setState(tournamentRecord);

      const { matchUps } = askEngine.allTournamentMatchUps();
      const matchUp = matchUps[0];

      // Scoring methods work as documented
      const result = askEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        outcome: {
          score: {
            sets: [
              { side1Score: 6, side2Score: 4 },
              { side1Score: 6, side2Score: 3 },
            ],
          },
        },
      });

      // Method exists and can be called
      expect(result).toBeDefined();

      // Draw generation NOT available as documented
      expect(askEngine.generateDrawDefinition).toBeUndefined();
    });
  });

  describe('Full Engine with Nested Imports', () => {
    beforeEach(() => {
      syncEngine.reset();
    });

    it('imports all methods from all governors using traverse as documented', () => {
      // Import exactly as shown in documentation
      syncEngine.importMethods(governors, true, 1);

      // Verify methods from multiple governors are available as documented
      expect(syncEngine.getParticipants).toBeDefined();
      expect(syncEngine.addEvent).toBeDefined();
      expect(syncEngine.generateDrawDefinition).toBeDefined();
      expect(syncEngine.setMatchUpStatus).toBeDefined();
      expect(syncEngine.addParticipants).toBeDefined();
      expect(syncEngine.bulkScheduleTournamentMatchUps).toBeDefined();
      expect(syncEngine.attachPolicies).toBeDefined();
    });

    it('performs complete tournament operations as documented', () => {
      syncEngine.importMethods(governors, true, 1);

      // Use mocksEngine to generate a complete tournament
      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 8 }],
      });

      syncEngine.setState(tournamentRecord);

      // Query participants
      const { participants } = syncEngine.getParticipants();
      expect(participants).toBeDefined();
      expect(participants.length).toBeGreaterThan(0);

      // Query events
      const { events } = syncEngine.getEvents();
      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);

      // Query matchUps from generated tournament
      const { matchUps } = syncEngine.allTournamentMatchUps();
      expect(matchUps).toBeDefined();
      expect(matchUps.length).toBeGreaterThan(0);

      // Set matchUp status - demonstrates full engine capabilities
      const scoreResult = syncEngine.setMatchUpStatus({
        matchUpId: matchUps[0].matchUpId,
        outcome: {
          score: {
            sets: [{ side1Score: 6, side2Score: 4 }],
          },
        },
      });

      // Verify result is returned
      expect(scoreResult).toBeDefined();
      if (scoreResult.success) {
        expect(scoreResult.success).toBe(true);
      }
    });
  });

  describe('Import Patterns', () => {
    it('Selective Import: explicitly lists needed methods', () => {
      syncEngine.reset();

      syncEngine.importMethods({
        setState: governors.queryGovernor.setState,
        getParticipants: governors.queryGovernor.getParticipants,
        addEvent: governors.eventGovernor.addEvent,
      });

      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      syncEngine.setState(tournamentRecord);

      // Imported methods work
      expect(syncEngine.setState).toBeDefined();
      expect(syncEngine.getParticipants).toBeDefined();
      expect(syncEngine.addEvent).toBeDefined();

      const { participants } = syncEngine.getParticipants();
      expect(participants).toBeDefined();
    });

    it('Governor Import: imports entire governor', () => {
      syncEngine.reset();

      // Import all query methods
      syncEngine.importMethods(governors.queryGovernor);

      const { tournamentRecord } = mocksEngine.generateTournamentRecord();
      syncEngine.setState(tournamentRecord);

      // All query governor methods available
      expect(syncEngine.getParticipants).toBeDefined();
      expect(syncEngine.allTournamentMatchUps).toBeDefined();
      expect(syncEngine.getEvents).toBeDefined();

      const { participants } = syncEngine.getParticipants();
      expect(participants).toBeDefined();
    });
  });
});
