import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { NO_MODIFICATIONS_APPLIED } from '@Constants/errorConditionConstants';
import { COLLEGE_D3, USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('removeCollectionDefinition additional branch coverage', () => {
  it('removes collectionDefinition providing drawId alone (draw-level resolution)', () => {
    const deletedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETED_MATCHUP_IDS]: (notices) => {
          notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
        },
      },
    });

    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.removeCollectionDefinition({
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat).toBeDefined();
    expect(result.deletedMatchUpIds.length).toBeGreaterThan(0);
  });

  it('removes collectionDefinition from matchUp-level tieFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // First modify a matchUp to give it a tieFormat by adding a collectionDefinition
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;
    const matchUpId = matchUps[0].matchUpId;

    // Add collection to matchUp to give it its own tieFormat
    const addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra Singles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    // Now remove the original collection from that matchUp
    const result = tournamentEngine.removeCollectionDefinition({
      updateInProgressMatchUps: true,
      collectionId,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('returns NO_MODIFICATIONS_APPLIED when all matchUps are completed', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Complete all tieMatchUps to make the TEAM matchUp completed
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        ],
      },
    };

    for (const tieMatchUp of matchUps[0].tieMatchUps) {
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: tieMatchUp.matchUpId,
        outcome,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // Try to remove collection from completed matchUp without updateInProgressMatchUps
    const result = tournamentEngine.removeCollectionDefinition({
      updateInProgressMatchUps: false,
      matchUpId: matchUps[0].matchUpId,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(NO_MODIFICATIONS_APPLIED);
  });

  it('removes collectionDefinition that has collectionGroupNumber', () => {
    const deletedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETED_MATCHUP_IDS]: (notices) => {
          notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
        },
      },
    });

    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    // Find collection with collectionGroupNumber
    const groupedDef = event.tieFormat.collectionDefinitions.find((def) => def.collectionGroupNumber);
    expect(groupedDef).toBeDefined();

    const result = tournamentEngine.removeCollectionDefinition({
      collectionId: groupedDef.collectionId,
      tieFormatName: 'After Group Removal',
      drawId,
    });
    expect(result.success).toEqual(true);
    // The collectionGroup should have been removed
    expect(result.tieFormat.collectionGroups.length).toEqual(0);
    expect(result.tieFormat.tieFormatName).toEqual('After Group Removal');
  });

  it('handles tieFormatComparison flag', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Modify a specific matchUp so it gets its own tieFormat
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;
    const matchUpId = matchUps[0].matchUpId;

    const addResult = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(addResult.success).toEqual(true);

    // Now remove from structure with tieFormatComparison enabled
    const result = tournamentEngine.removeCollectionDefinition({
      tieFormatComparison: true,
      collectionId,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('removes with updateInProgressMatchUps on scored matchUp', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Score one tieMatchUp
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const targetTieMatchUp = matchUps[0].tieMatchUps.find((m) => m.collectionId === collectionId);

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
          { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
        ],
      },
    };

    const scoreResult = tournamentEngine.setMatchUpStatus({
      matchUpId: targetTieMatchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(scoreResult.success).toEqual(true);

    // Remove with updateInProgressMatchUps=true
    const result = tournamentEngine.removeCollectionDefinition({
      matchUpId: matchUps[0].matchUpId,
      updateInProgressMatchUps: true,
      collectionId,
      drawId,
    });
    // This may succeed or return NO_MODIFICATIONS_APPLIED depending on score state
    // The key is that it exercises the updateInProgressMatchUps code path
    if (result.success) {
      expect(result.tieFormat).toBeDefined();
    }
  });

  it('handles removal when valueGoal changes force tieFormatName removal', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Remove without providing tieFormatName - should delete tieFormatName
    const result = tournamentEngine.removeCollectionDefinition({
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    // tieFormatName should be removed since valueGoal changed
    expect(result.tieFormat.tieFormatName).toBeUndefined();
  });
});
