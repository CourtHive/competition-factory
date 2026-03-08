import { aggregateTieFormats } from '@Mutate/tieFormat/aggregateTieFormats';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('aggregateTieFormats additional branch coverage', () => {
  it('returns error when no tournamentRecord is provided', () => {
    const result = aggregateTieFormats({ tournamentRecord: undefined as any });
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
  });

  it('handles tournament with no events', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord();
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toEqual(0);
  });

  it('aggregates tieFormats when matchUps have unique tieFormats', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    // Modify one matchUp to have a different tieFormat
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const matchUpId = matchUps[0].matchUpId;

    // Add a collection to one matchUp to make its tieFormat unique
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

    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThan(0);
  });

  it('aggregates tieFormats from structure-level tieFormats', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Modify collection on structure level to create a structure-level tieFormat
    const modResult = tournamentEngine.modifyCollectionDefinition({
      collectionName: 'Structure Modified',
      collectionId,
      structureId,
      drawId,
    });
    expect(modResult.success).toEqual(true);

    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThan(0);
  });

  it('aggregates tieFormats from draw-level tieFormats', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Modify at draw level to create drawDefinition.tieFormat
    const modResult = tournamentEngine.modifyCollectionDefinition({
      collectionName: 'Draw Modified',
      collectionId,
      drawId,
    });
    expect(modResult.success).toEqual(true);

    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThan(0);
  });

  it('handles events without tieFormat', () => {
    // Create a non-TEAM event
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toEqual(0);
  });

  it('identifies matching tieFormats across matchUps', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    // All matchUps share the same inherited tieFormat, so aggregation should de-duplicate
    const result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    // addedCount should be at least 1 for the event-level tieFormat
    expect(result.addedCount).toBeGreaterThanOrEqual(1);

    // Verify the aggregation result - matchUps should have tieFormatId
    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;

    // All matchUps should have tieFormatId after aggregation
    for (const matchUp of matchUps) {
      expect(matchUp.tieFormatId).toBeDefined();
    }
  });
});
