import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getTallyReport } from '@Query/matchUps/roundRobinTally/getTallyReport';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MISSING_MATCHUPS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

describe('Round Robin Tally - Extended Coverage', () => {
  describe('tallyParticipantResults', () => {
    // Parameter validation
    it('returns error when matchUps is missing', () => {
      const result = tallyParticipantResults({
        matchUps: null as any,
      });
      expect(result.error).toBe(MISSING_MATCHUPS);
    });

    it('returns error when matchUps is undefined', () => {
      const result = tallyParticipantResults({
        matchUps: undefined as any,
      });
      expect(result.error).toBe(MISSING_MATCHUPS);
    });

    it('returns error when matchUps is empty array', () => {
      const result = tallyParticipantResults({
        matchUps: [],
      });
      expect(result.error).toBe(MISSING_MATCHUPS);
    });

    it('returns error when matchUps contains invalid data', () => {
      const result = tallyParticipantResults({
        matchUps: ['invalid'] as any,
      });
      expect(result.error).toBe(MISSING_MATCHUPS);
    });

    it('returns error when matchUps from multiple structures', () => {
      const drawProfiles = [
        { drawSize: 4, drawType: ROUND_ROBIN },
        { drawSize: 4, drawType: ROUND_ROBIN },
      ];

      const { tournamentRecord } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      // Get matchUps from both events
      const { matchUps: matchUps1 } = tournamentEngine.allTournamentMatchUps();

      // Mix matchUps from different structures
      const result = tallyParticipantResults({
        matchUps: matchUps1,
      });

      expect(result.error).toBe(INVALID_VALUES);
    });

    // Complete bracket tests
    it('calculates participant results for completed bracket', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          participantsCount: 4,
          drawType: ROUND_ROBIN,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      expect(result.bracketComplete).toBe(true);
      expect(result.participantResults).toBeDefined();
      expect(Object.keys(result.participantResults)).toHaveLength(4);
      expect(result.order).toBeDefined();
      expect(result.order).toHaveLength(4);
    });

    it('sets groupOrder for completed bracket', () => {
      const drawProfiles = [{ drawSize: 4, drawType: ROUND_ROBIN }];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      Object.values(result.participantResults).forEach((pr: any) => {
        expect(pr.groupOrder).toBeDefined();
        expect(pr.rankOrder).toBeDefined();
      });
    });

    // Incomplete bracket tests
    it('calculates provisional order for incomplete bracket', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          outcomes: [
            {
              drawPositions: [1, 2],
              scoreString: '6-1 6-2',
              winningSide: 1,
            },
          ],
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      expect(result.bracketComplete).toBe(false);
      expect(result.participantResults).toBeDefined();

      // Should have provisionalOrder, not groupOrder
      Object.values(result.participantResults).forEach((pr: any) => {
        if (pr.matchUpsPlayed > 0) {
          expect(pr.provisionalOrder).toBeDefined();
          expect(pr.groupOrder).toBeUndefined();
        }
      });
    });

    // Generate report tests
    it('generates readable report when generateReport is true', () => {
      const drawProfiles = [
        {
          drawType: ROUND_ROBIN,
          drawSize: 4,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result: any = tallyParticipantResults({
        generateReport: true,
        matchUps,
      });

      expect(result.readableReport).toBeDefined();
      expect(result.readableReport.length).toBeGreaterThan(0);
      expect(result.report).toBeDefined();
    });

    it('does not generate report by default', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      expect(result.readableReport).toBe('');
    });

    // Pressure rating tests
    it('calculates pressure ratings when pressureRating provided', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({
        matchUps,
        pressureRating: true,
      });

      Object.values(result.participantResults).forEach((pr: any) => {
        expect(pr.pressureOrder).toBeDefined();
        expect(pr.pressureScores).toBeDefined();
      });
    });

    it('does not calculate pressure ratings by default', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      Object.values(result.participantResults).forEach((pr: any) => {
        expect(pr.pressureOrder).toBeUndefined();
      });
    });

    // matchUpFormat tests
    it('uses provided matchUpFormat', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          matchUpFormat: FORMAT_STANDARD,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({
        matchUps,
        matchUpFormat: FORMAT_STANDARD,
      });

      expect(result.participantResults).toBeDefined();
    });

    // perPlayer tests
    it('uses perPlayer parameter for calculations', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({
        matchUps,
        perPlayer: 3,
      });

      expect(result.participantResults).toBeDefined();
    });

    it('ignores perPlayer when bracket incomplete', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          outcomes: [
            {
              drawPositions: [1, 2],
              scoreString: '6-1 6-2',
              winningSide: 1,
            },
          ],
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({
        matchUps,
        perPlayer: 3,
      });

      expect(result.bracketComplete).toBe(false);
      expect(result.participantResults).toBeDefined();
    });

    // Different draw sizes
    it('handles 3-player round robin', () => {
      const drawProfiles = [
        {
          drawType: ROUND_ROBIN,
          participantsCount: 3,
          drawSize: 3,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      expect(result.bracketComplete).toBe(true);
      expect(Object.keys(result.participantResults)).toHaveLength(3);
      expect(result.order).toHaveLength(3);
    });

    // BYE handling
    it('filters out BYE matchUps', () => {
      const drawProfiles = [
        {
          drawType: ROUND_ROBIN,
          participantsCount: 3, // Creates a BYE
          drawSize: 4,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const result = tallyParticipantResults({ matchUps });

      expect(result.participantResults).toBeDefined();
      // Should only have results for actual participants, not BYE
      expect(Object.keys(result.participantResults)).toHaveLength(3);
    });

    // Policy definitions
    it('uses provided policy definitions', () => {
      const drawProfiles = [{ drawType: ROUND_ROBIN, drawSize: 4 }];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const customPolicy = {
        POLICY_TYPE_ROUND_ROBIN_TALLY: {
          headToHead: { disabled: false },
        },
      };

      const result = tallyParticipantResults({
        policyDefinitions: customPolicy,
        matchUps,
      } as any);

      expect(result.participantResults).toBeDefined();
    });

    // subOrderMap tests
    it('uses subOrderMap when provided', () => {
      const drawProfiles = [{ drawSize: 4, drawType: ROUND_ROBIN }];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const subOrderMap = { participantId1: 1, participantId2: 2 };

      const result = tallyParticipantResults({
        matchUps,
        subOrderMap,
      });

      expect(result.participantResults).toBeDefined();
    });
  });

  describe('getTallyReport', () => {
    it('generates readable report from matchUps and order', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const { order, report } = tallyParticipantResults({ matchUps });

      const readable = getTallyReport({ matchUps, order, report });

      expect(readable).toBeDefined();
      expect(typeof readable).toBe('string');
      expect(readable.length).toBeGreaterThan(0);
      expect(readable).toContain('Final Order');
    });

    it('handles empty report array', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const readable = getTallyReport({
        matchUps,
        order: [],
        report: [],
      });

      expect(readable).toBeDefined();
      expect(readable).toContain('Final Order');
    });

    it('includes participant names in report', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const { order, report } = tallyParticipantResults({ matchUps });

      const readable = getTallyReport({ matchUps, order, report });

      // Should contain participant information
      expect(readable.length).toBeGreaterThan(50);
    });

    it('handles undefined report', () => {
      const drawProfiles = [
        {
          drawSize: 4,
          drawType: ROUND_ROBIN,
          completeAllMatchUps: true,
        },
      ];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const readable = getTallyReport({
        matchUps,
        order: [],
        report: undefined,
      });

      expect(readable).toBeDefined();
    });

    it('formats order with groupOrder and resolved status', () => {
      const drawProfiles = [{ drawType: ROUND_ROBIN, drawSize: 4 }];

      const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
        completeAllMatchUps: true,
        drawProfiles,
      });

      tournamentEngine.setState(tournamentRecord);

      const { matchUps } = tournamentEngine.allDrawMatchUps({
        drawId: drawIds[0],
        inContext: true,
      });

      const { order, report } = tallyParticipantResults({ matchUps });

      const readable = getTallyReport({ matchUps, order, report });

      expect(readable).toContain('resolved:');
    });
  });
});
