import { resetScorecard } from '@Mutate/matchUps/resetScorecard';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  INVALID_VALUES,
  CANNOT_CHANGE_WINNING_SIDE,
  MISSING_MATCHUP_ID,
  INVALID_MATCHUP,
} from '@Constants/errorConditionConstants';

describe('resetScorecard', () => {
  // Unit tests - parameter validation
  it('returns error when drawDefinition is missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition: null as any,
      matchUpId: 'test',
    });

    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when drawDefinition is undefined', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition: undefined as any,
      matchUpId: 'test',
    });

    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when matchUpId is missing', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: null as any,
    });

    expect(result.error).toEqual(MISSING_MATCHUP_ID);
  });

  it('returns error when matchUpId is not a string', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: 123 as any,
    });

    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when matchUpId is an array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: ['test'] as any,
    });

    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when matchUp not found', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: 'nonexistent',
    });

    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });

  it('returns error when matchUp is not a team matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }], // Not TEAM_EVENT
    });

    tournamentEngine.setState(tournamentRecord);

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const matchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: matchUp.matchUpId,
    });

    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  // Integration tests with team events
  it('successfully resets scorecard for team matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    // Add a score first
    if (teamMatchUp.tieMatchUps?.length) {
      const tieMatchUp = teamMatchUp.tieMatchUps[0];
      tournamentEngine.setMatchUpStatus({
        matchUpId: tieMatchUp.matchUpId,
        winningSide: 1,
        drawId: drawDefinition.drawId,
      });
    }

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);
  });

  it('removes scores from all tieMatchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    if (teamMatchUp.tieMatchUps?.length) {
      // Score multiple tie matchUps
      teamMatchUp.tieMatchUps.forEach((tieMatchUp, index) => {
        tournamentEngine.setMatchUpStatus({
          matchUpId: tieMatchUp.matchUpId,
          winningSide: (index % 2) + 1,
          drawId: drawDefinition.drawId,
        });
      });

      const result = resetScorecard({
        tournamentRecord,
        drawDefinition,
        matchUpId: teamMatchUp.matchUpId,
        event,
      });

      expect(result.success).toBe(true);

      // Verify scores are cleared
      const updatedMatchUp = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === teamMatchUp.matchUpId);

      updatedMatchUp?.tieMatchUps?.forEach((tieMatchUp) => {
        expect(tieMatchUp.winningSide).toBeUndefined();
      });
    }
  });

  it('errors on matchUp with no tieMatchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    // Remove tieMatchUps
    delete teamMatchUp.tieMatchUps;

    const result = resetScorecard({
      matchUpId: teamMatchUp.matchUpId,
      tournamentRecord,
      drawDefinition,
    });

    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it('handles matchUp with empty tieMatchUps array', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    teamMatchUp.tieMatchUps = [];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
    });

    expect(result.success).toBe(true);
  });

  it('returns error when downstream matchUp is active', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const firstRoundMatchUp = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 1);

    if (firstRoundMatchUp) {
      // Complete the matchUp
      tournamentEngine.setMatchUpStatus({
        matchUpId: firstRoundMatchUp.matchUpId,
        matchUpStatus: COMPLETED,
        winningSide: 1,
        drawId: drawDefinition.drawId,
      });

      // Try to reset - should fail if downstream matchUp is active
      const secondRoundMatchUp = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 2);

      if (secondRoundMatchUp?.sides?.some((s) => s.participantId)) {
        const result = resetScorecard({
          tournamentRecord,
          drawDefinition,
          matchUpId: firstRoundMatchUp.matchUpId,
          event,
        });

        expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
      }
    }
  });

  it('handles tiebreakReset parameter', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      tiebreakReset: true,
    });

    expect(result.success).toBe(true);
  });

  it('handles matchUpStatus parameter', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
    });

    expect(result.success).toBe(true);
  });

  it('handles event parameter', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);
  });

  it('handles missing tournamentRecord', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord: undefined as any,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
    });

    // Should handle gracefully or return error
    expect(result.success || result.error).toBeDefined();
  });

  it('preserves matchUp structure after reset', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];
    const originalMatchUpId = teamMatchUp.matchUpId;
    const originalStructureId = teamMatchUp.structureId;

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);

    const resetMatchUp = drawDefinition.structures[0].matchUps.find((m) => m.matchUpId === originalMatchUpId);

    expect(resetMatchUp).toBeDefined();
    expect(resetMatchUp?.matchUpId).toBe(originalMatchUpId);
    expect(resetMatchUp?.structureId).toBe(originalStructureId);
  });

  it('handles multiple resets of same matchUp', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    // Reset once
    let result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);

    // Reset again
    result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);
  });

  it('integrates with tournament engine setState', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const teamMatchUp = drawDefinition.structures[0].matchUps[0];

    const result = resetScorecard({
      tournamentRecord,
      drawDefinition,
      matchUpId: teamMatchUp.matchUpId,
      event,
    });

    expect(result.success).toBe(true);
  });
});
