import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { updateTieFormat } from '@Mutate/tieFormat/updateTieFormat';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  CANNOT_MODIFY_TIEFORMAT,
  INVALID_MATCHUP,
  INVALID_TIE_FORMAT,
  MISSING_DRAW_DEFINITION,
} from '@Constants/errorConditionConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('updateTieFormat coverage', () => {
  it('returns MISSING_DRAW_DEFINITION when no target is provided', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const tieFormat = event.tieFormat;

    const result = updateTieFormat({ tieFormat });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns INVALID_MATCHUP when matchUp has no tieMatchUps', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const tieFormat = event.tieFormat;

    const result = updateTieFormat({ tieFormat, matchUp: { matchUpId: 'fake' } as any });
    expect(result.error).toEqual(INVALID_MATCHUP);
  });

  it('returns CANNOT_MODIFY_TIEFORMAT for in-progress matchUp without updateInProgressMatchUps', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const tieFormat = event.tieFormat;

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const teamMatchUp = matchUps[0];
    const tieMatchUpId = teamMatchUp.tieMatchUps[0].matchUpId;

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        ],
      },
    };

    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: tieMatchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Get fresh matchUp data (not in context)
    const freshMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
      inContext: false,
    }).matchUps;
    const freshTeamMatchUp = freshMatchUps.find((m) => m.matchUpId === teamMatchUp.matchUpId);

    // Equivalent tieFormat but matchUp is IN_PROGRESS
    const matchUpTieFormat = freshTeamMatchUp.tieFormat || tieFormat;
    const resultUpdate = updateTieFormat({
      tieFormat: matchUpTieFormat,
      matchUp: freshTeamMatchUp,
      updateInProgressMatchUps: false,
      drawDefinition,
      event,
    });
    expect(resultUpdate.error).toEqual(CANNOT_MODIFY_TIEFORMAT);
  });

  it('returns INVALID_TIE_FORMAT when matchUp changes are not possible', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const teamMatchUp = matchUps[0];
    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        ],
      },
    };

    // Score all tieMatchUps so none are TO_BE_PLAYED
    for (const tieMatchUp of teamMatchUp.tieMatchUps) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: tieMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Get fresh matchUp
    const freshMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
      inContext: false,
    }).matchUps;
    const freshTeamMatchUp = freshMatchUps.find((m) => m.matchUpId === teamMatchUp.matchUpId);

    // Create a tieFormat that reduces matchUpCount - requires removing played matchUps
    const modifiedTieFormat = copyTieFormat(freshTeamMatchUp.tieFormat || event.tieFormat);
    modifiedTieFormat.collectionDefinitions[0].matchUpCount = 1;

    const result = updateTieFormat({
      tieFormat: modifiedTieFormat,
      matchUp: freshTeamMatchUp,
      updateInProgressMatchUps: true,
      drawDefinition,
      event,
    });
    expect(result.error).toEqual(INVALID_TIE_FORMAT);
  });

  it('updates tieFormat at event level, propagating to draw definitions', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const modifiedTieFormat = copyTieFormat(event.tieFormat);
    modifiedTieFormat.collectionDefinitions[0].collectionName = 'Updated Doubles';

    const result: any = updateTieFormat({
      tieFormat: modifiedTieFormat,
      eventId,
      event,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedCount).toBeGreaterThanOrEqual(1);
  });

  it('updates tieFormat at drawDefinition level', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const modifiedTieFormat = copyTieFormat(event.tieFormat);

    const result: any = updateTieFormat({
      tieFormat: modifiedTieFormat,
      drawDefinition,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedCount).toBeGreaterThanOrEqual(1);
  });

  it('updates tieFormat at structure level with inherited format', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structure = drawDefinition.structures[0];

    const modifiedTieFormat = copyTieFormat(event.tieFormat);
    modifiedTieFormat.collectionDefinitions[0].collectionName = 'Structure Doubles';

    const result: any = updateTieFormat({
      tieFormat: modifiedTieFormat,
      drawDefinition,
      structure,
      event,
    });
    expect(result.success).toEqual(true);
  });

  it('handles equivalent matchUp tieFormat with updateInProgressMatchUps=true', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const teamMatchUp = matchUps[0];
    const tieMatchUpId = teamMatchUp.tieMatchUps[0].matchUpId;

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        ],
      },
    };

    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: tieMatchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    const freshMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
      inContext: false,
    }).matchUps;
    const freshTeamMatchUp = freshMatchUps.find((m) => m.matchUpId === teamMatchUp.matchUpId);

    const modifiedTieFormat = copyTieFormat(freshTeamMatchUp.tieFormat || event.tieFormat);

    // With updateInProgressMatchUps=true, equivalent format should succeed
    result = updateTieFormat({
      tieFormat: modifiedTieFormat,
      matchUp: freshTeamMatchUp,
      updateInProgressMatchUps: true,
      drawDefinition,
      event,
    });
    expect(result.success).toEqual(true);
  });

  it('adds matchUps when tieFormat increases matchUpCount on matchUp', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
      inContext: false,
    }).matchUps;

    const teamMatchUp = matchUps[0];
    const modifiedTieFormat = copyTieFormat(event.tieFormat);
    // Increase matchUpCount to add new matchUps
    modifiedTieFormat.collectionDefinitions[0].matchUpCount += 2;

    const result: any = updateTieFormat({
      tieFormat: modifiedTieFormat,
      matchUp: teamMatchUp,
      updateInProgressMatchUps: true,
      drawDefinition,
      event,
    });
    expect(result.success).toEqual(true);
    expect(result.addedMatchUpsCount).toBeGreaterThan(0);
  });
});
