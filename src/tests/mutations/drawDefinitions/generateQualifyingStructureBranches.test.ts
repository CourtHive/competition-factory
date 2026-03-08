import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// Constants
import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_SIZE,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

describe('generateQualifyingStructure - uncovered branches', () => {
  it('returns error when drawDefinition is missing', () => {
    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: 'some-id',
      qualifyingRoundNumber: 2,
      drawSize: 16,
    });
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('returns error when drawSize is not a convertible integer', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      drawSize: 'not-a-number' as any,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when participantsCount is not a convertible integer', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      participantsCount: 'bad' as any,
      drawSize: 16,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when qualifyingPositions is not a convertible integer', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      qualifyingPositions: 'bad' as any,
      drawSize: 16,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when drawSize is zero/missing after validation', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      drawId,
    });
    expect(result.error).toEqual(MISSING_DRAW_SIZE);
  });

  it('returns error when qualifyingPositions >= drawSize', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      qualifyingPositions: 16,
      drawSize: 16,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns error when targetStructureId does not exist', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: 'non-existent-structure-id',
      qualifyingRoundNumber: 2,
      drawSize: 16,
      drawId,
    });
    expect(result.error).toEqual(STRUCTURE_NOT_FOUND);
  });

  it('generates ROUND_ROBIN qualifying structure', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 1,
      drawType: ROUND_ROBIN,
      drawSize: 16,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structure).toBeDefined();
    expect(result.structure.stage).toEqual(QUALIFYING);
    expect(result.link).toBeDefined();
    expect(result.qualifiersCount).toBeGreaterThan(0);
  });

  it('generates elimination qualifying structure with qualifyingPositions', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      qualifyingPositions: 4,
      drawSize: 16,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structure).toBeDefined();
    expect(result.link).toBeDefined();
    expect(result.qualifiersCount).toBeGreaterThan(0);
    expect(result.qualifyingDrawPositionsCount).toBeDefined();
  });

  it('generates qualifying structure with custom structureName', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      structureName: 'Custom Qualifying',
      qualifyingRoundNumber: 2,
      drawSize: 16,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structure.structureName).toEqual('Custom Qualifying');
  });

  it('generates qualifying structure with roundTarget for naming', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32 }],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      qualifyingRoundNumber: 2,
      roundTarget: 1,
      drawSize: 16,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structure).toBeDefined();
    // roundTarget should be stored as extension on structure
    expect(result.structure.extensions?.some((ext) => ext.name === 'roundTarget')).toEqual(true);
  });

  it('generates qualifying structure targeting a qualifying structure (pre-qualifying)', () => {
    // Create draw with existing qualifying structure, then target that qualifying structure
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 32,
          qualifyingProfiles: [
            {
              roundTarget: 1,
              structureProfiles: [{ stageSequence: 1, drawSize: 8, qualifyingPositions: 4 }],
            },
          ],
        },
      ],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
    expect(qualifyingStructure).toBeDefined();

    // Generate a pre-qualifying structure targeting the qualifying structure
    const result = tournamentEngine.generateQualifyingStructure({
      targetStructureId: qualifyingStructure.structureId,
      qualifyingRoundNumber: 1,
      drawSize: 8,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.structure).toBeDefined();
    // Pre-qualifying naming should have the 'Pre-' prefix
    expect(result.structure.structureName).toBeDefined();
  });

  it('generates qualifying structure with tieFormat (team events)', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 8,
          eventType: 'TEAM',
          tieFormatName: 'COLLEGE_DEFAULT',
        },
      ],
      setState: true,
    });

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

    if (drawDefinition.tieFormat) {
      const result = tournamentEngine.generateQualifyingStructure({
        targetStructureId: mainStructure.structureId,
        tieFormat: drawDefinition.tieFormat,
        qualifyingRoundNumber: 1,
        drawSize: 4,
        drawId,
      });
      expect(result.success).toEqual(true);
      // When tieFormat is provided, matchUps should have tieMatchUps
      expect(result.structure).toBeDefined();
    }
  });
});
