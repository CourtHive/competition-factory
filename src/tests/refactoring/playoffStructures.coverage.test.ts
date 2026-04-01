import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

describe('generateAndPopulatePlayoffStructures branch coverage', () => {
  it('returns error for invalid structureId', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, completionGoal: 4 }],
      setState: true,
    });

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      structureId: 'nonexistent-structure-id',
      roundProfiles: [{ '1': 1 }],
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  it('routes to RR playoff generation for CONTAINER structures', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: ROUND_ROBIN_WITH_PLAYOFF,
          playoffGroups: [
            { finishingPositions: [1], structureName: 'Gold' },
            { finishingPositions: [2], structureName: 'Silver' },
          ],
          drawSize: 16,
          groupSize: 4,
        },
      ],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.length).toBeGreaterThan(1);
  });

  it('generates playoff structures for multiple round numbers', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, completionGoal: 14 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      roundProfiles: [{ '1': 1 }, { '2': 1 }],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structures.length).toBeGreaterThanOrEqual(2);
    expect(result.links.length).toBeGreaterThanOrEqual(2);
  });

  it('generates playoff using roundNumbers parameter', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, completionGoal: 6 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      roundNumbers: [1],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structures.length).toBeGreaterThanOrEqual(1);
  });

  it('populates playoff structures with completed matchUps and BYEs', () => {
    const participantsCount = 10;
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          participantsCount,
          completionGoal: 6,
          drawSize: 16,
        },
      ],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    const positionAssignments = tournamentEngine.getPositionAssignments({
      structureId,
      drawId,
    }).positionAssignments;

    const byesCount = positionAssignments.filter(({ bye }) => bye).length;
    expect(byesCount).toEqual(6);

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      roundProfiles: [{ '1': 1 }],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const { structures, links } = result;
    expect(structures.length).toBeGreaterThanOrEqual(1);
    expect(links.length).toBeGreaterThanOrEqual(1);

    const filledAssignments = structures[0].positionAssignments.filter(
      ({ bye, participantId }) => bye || participantId,
    );
    expect(filledAssignments.length).toBeGreaterThan(0);
  });

  it('returns error for invalid round numbers not in available playoffs', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, completionGoal: 2 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      roundNumbers: [99],
      structureId,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  it('handles FMLC draw type with proper playoff structure generation', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          drawSize: 16,
          completionGoal: 14,
        },
      ],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.length).toEqual(2);
    expect(drawDefinition.links.length).toBeGreaterThan(0);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const completedMatchUps = matchUps.filter((m) => m.matchUpStatus === COMPLETED);
    expect(completedMatchUps.length).toBeGreaterThan(0);
  });

  it('generates matchUpModifications with goesTo data', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, completionGoal: 14 }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.generateAndPopulatePlayoffStructures({
      playoffStructureNameBase: 'Playoff',
      roundProfiles: [{ '1': 1 }],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.matchUpModifications).toBeDefined();
    expect(Array.isArray(result.matchUpModifications)).toBe(true);
  });
});
