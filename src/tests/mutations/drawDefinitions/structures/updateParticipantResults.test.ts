/**
 * Regression test for the `updateParticipantResults` mutation — the
 * manual escape hatch for round-robin draws whose matchUps were imported
 * with scores already populated and so never triggered the normal save
 * path (modifyMatchUpScore → updateTallyIfNeeded). Without this mutation
 * the bracket stats view shows no rows because positionAssignments carry
 * no tally.
 */
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import tournamentEngine from '../../../engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SINGLES } from '@Constants/eventConstants';

function buildCompletedRRTournament() {
  const drawProfiles = [
    {
      drawSize: 4,
      drawType: ROUND_ROBIN,
      eventType: SINGLES,
      outcomes: [
        { drawPositions: [1, 2], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [1, 3], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [1, 4], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [2, 3], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [2, 4], scoreString: '6-3 6-3', winningSide: 1 },
        { drawPositions: [3, 4], scoreString: '6-3 6-3', winningSide: 1 },
      ],
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const containerStructure = drawDefinition.structures[0];
  const groupStructure = containerStructure.structures[0];
  return { drawId, containerStructure, groupStructure };
}

function stripTally(assignment: any) {
  delete assignment.tally;
  assignment.extensions = (assignment.extensions ?? []).filter((ext: any) => ext?.name !== TALLY);
}

describe('updateParticipantResults', () => {
  it('returns MISSING_STRUCTURE_ID when no structureId is supplied', () => {
    const { drawId } = buildCompletedRRTournament();
    const result = tournamentEngine.updateParticipantResults({ drawId } as any);
    expect(result.error).toBe(MISSING_STRUCTURE_ID);
  });

  it('returns STRUCTURE_NOT_FOUND when the structureId does not exist', () => {
    const { drawId } = buildCompletedRRTournament();
    const result = tournamentEngine.updateParticipantResults({ drawId, structureId: 'does-not-exist' });
    expect(result.error).toBe(STRUCTURE_NOT_FOUND);
  });

  it('restores tally on a CONTAINER whose group positionAssignments were stripped', () => {
    const { drawId, containerStructure, groupStructure } = buildCompletedRRTournament();

    // Sanity check: post-generation the normal save path has tallied.
    expect(
      groupStructure.positionAssignments.every((pa: any) =>
        firstClassOrExtension({ element: pa, attribute: 'tally', name: TALLY }),
      ),
    ).toBe(true);

    // Simulate a "reconstructed from completed matchUps" draw — drop the
    // tallies so the stats view would show empty rows.
    groupStructure.positionAssignments.forEach(stripTally);
    expect(
      groupStructure.positionAssignments.every(
        (pa: any) => !firstClassOrExtension({ element: pa, attribute: 'tally', name: TALLY }),
      ),
    ).toBe(true);

    // Recalculate via the new public mutation, targeting the CONTAINER
    // structure (which is what the TMX stats panel passes).
    const result = tournamentEngine.updateParticipantResults({
      structureId: containerStructure.structureId,
      drawId,
    });
    expect(result.success).toBe(true);

    // The CONTAINER walks into its child groups, so the per-group
    // positionAssignments end up with `tally` populated again.
    const { drawDefinition: refreshed } = tournamentEngine.getEvent({ drawId });
    const refreshedGroup = refreshed.structures[0].structures[0];
    expect(
      refreshedGroup.positionAssignments.every((pa: any) =>
        firstClassOrExtension({ element: pa, attribute: 'tally', name: TALLY }),
      ),
    ).toBe(true);

    // dp 1 swept the group — should have 3 wins.
    const dp1 = refreshedGroup.positionAssignments.find((pa: any) => pa.drawPosition === 1);
    const dp1Tally: any = firstClassOrExtension({ element: dp1, attribute: 'tally', name: TALLY });
    expect(dp1Tally.matchUpsWon).toBe(3);
    expect(dp1Tally.matchUpsLost).toBe(0);
  });

  it('makes getDrawData return non-empty participantResults after recalculation', () => {
    const { drawId, containerStructure, groupStructure } = buildCompletedRRTournament();
    groupStructure.positionAssignments.forEach(stripTally);

    // Recalculate.
    tournamentEngine.updateParticipantResults({ drawId, structureId: containerStructure.structureId });

    // getDrawData against the CONTAINER (matches how TMX stats panel reads).
    const drawData: any = tournamentEngine.getDrawData({ drawId, allParticipantResults: true });
    const containerData = drawData.structures.find((s: any) => s.structureId === containerStructure.structureId);
    const participantResults = containerData.participantResults ?? [];
    expect(participantResults.length).toBeGreaterThan(0);
    expect(participantResults.every((r: any) => r.participantResult)).toBe(true);
  });
});
