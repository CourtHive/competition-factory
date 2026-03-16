import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// Constants
import { MISSING_STRUCTURE, UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';
import {
  CONSOLATION,
  MAIN,
  AD_HOC,
  LUCKY_DRAW,
  SINGLE_ELIMINATION,
  ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

describe('generateConsolationStructure', () => {
  it('generates an AD_HOC consolation structure with empty matchUps', () => {
    const result = tournamentEngine.generateConsolationStructure({
      structureType: AD_HOC,
      structureName: 'Consolation',
      drawSize: 8,
    });

    expect(result.success).toEqual(true);
    expect(result.structures).toBeDefined();
    expect(result.structures.length).toEqual(1);

    const structure = result.structures[0];
    expect(structure.stage).toEqual(CONSOLATION);
    expect(structure.stageSequence).toEqual(1);
    expect(structure.structureName).toEqual('Consolation');
    expect(structure.matchUps).toEqual([]);
    expect(structure.structureId).toBeDefined();
  });

  it('generates a SINGLE_ELIMINATION consolation structure with bracket matchUps', () => {
    const result = tournamentEngine.generateConsolationStructure({
      structureType: SINGLE_ELIMINATION,
      structureName: 'SE Consolation',
      drawSize: 8,
    });

    expect(result.success).toEqual(true);
    expect(result.structures.length).toEqual(1);

    const structure = result.structures[0];
    expect(structure.stage).toEqual(CONSOLATION);
    expect(structure.structureName).toEqual('SE Consolation');
    // 8-draw SE has 7 matchUps (4 + 2 + 1)
    expect(structure.matchUps.length).toEqual(7);
  });

  it('generates a LUCKY_DRAW consolation structure', () => {
    const result = tournamentEngine.generateConsolationStructure({
      structureType: LUCKY_DRAW,
      structureName: 'Lucky Consolation',
      drawSize: 9,
    });

    expect(result.success).toEqual(true);
    expect(result.structures.length).toEqual(1);

    const structure = result.structures[0];
    expect(structure.stage).toEqual(CONSOLATION);
    expect(structure.matchUps.length).toBeGreaterThan(0);
  });

  it('generates a ROUND_ROBIN consolation structure', () => {
    const result = tournamentEngine.generateConsolationStructure({
      structureType: ROUND_ROBIN,
      structureName: 'RR Consolation',
      drawSize: 8,
    });

    expect(result.success).toEqual(true);
    expect(result.structures.length).toEqual(1);

    const structure = result.structures[0];
    expect(structure.stage).toEqual(CONSOLATION);
    // RR structure is a CONTAINER with child structures (groups)
    expect(structure.structures).toBeDefined();
  });

  it('returns error for unrecognized draw type', () => {
    const result = tournamentEngine.generateConsolationStructure({
      structureType: 'NONEXISTENT_TYPE',
      drawSize: 8,
    });

    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
  });

  it('defaults to AD_HOC when no structureType specified', () => {
    const result = tournamentEngine.generateConsolationStructure({
      drawSize: 8,
    });

    expect(result.success).toEqual(true);
    expect(result.structures[0].matchUps).toEqual([]);
  });

  it('defaults structureName to Consolation', () => {
    const result = tournamentEngine.generateConsolationStructure({
      drawSize: 4,
    });

    expect(result.success).toEqual(true);
    expect(result.structures[0].structureName).toEqual('Consolation');
  });
});

describe('addLinkedConsolationStructure', () => {
  it('generates and attaches an AD_HOC consolation with LOSER links', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION }],
    });

    tournamentEngine.setState(tournamentRecord);

    let { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s) => s.stage === MAIN)?.structureId;
    expect(mainStructureId).toBeDefined();

    const initialStructureCount = drawDefinition.structures.length;

    const result = tournamentEngine.addLinkedConsolationStructure({
      structureId: mainStructureId,
      structureType: AD_HOC,
      structureName: 'Ad Hoc Consolation',
      drawSize: 8,
      drawId,
      links: [
        { sourceRoundNumber: 1, targetRoundNumber: 1 },
        { sourceRoundNumber: 2, targetRoundNumber: 1 },
      ],
    });

    expect(result.success).toEqual(true);

    ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
    expect(drawDefinition.structures.length).toEqual(initialStructureCount + 1);

    const consolation = drawDefinition.structures.find((s) => s.stage === CONSOLATION);
    expect(consolation).toBeDefined();
    expect(consolation.structureName).toEqual('Ad Hoc Consolation');
    expect(consolation.matchUps).toEqual([]);

    // Verify LOSER links were created
    const loserLinks = drawDefinition.links.filter((l) => l.linkType === 'LOSER');
    expect(loserLinks.length).toEqual(2);

    const link1 = loserLinks.find((l) => l.source.roundNumber === 1);
    expect(link1.source.structureId).toEqual(mainStructureId);
    expect(link1.target.structureId).toEqual(consolation.structureId);
    expect(link1.target.roundNumber).toEqual(1);

    const link2 = loserLinks.find((l) => l.source.roundNumber === 2);
    expect(link2.source.structureId).toEqual(mainStructureId);
    expect(link2.target.roundNumber).toEqual(1);
  });

  it('generates and attaches a SINGLE_ELIMINATION consolation with bracket', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: SINGLE_ELIMINATION }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s) => s.stage === MAIN)?.structureId;

    const result = tournamentEngine.addLinkedConsolationStructure({
      structureId: mainStructureId,
      structureType: SINGLE_ELIMINATION,
      structureName: 'SE Consolation',
      drawSize: 8,
      drawId,
      links: [{ sourceRoundNumber: 1, targetRoundNumber: 1 }],
    });

    expect(result.success).toEqual(true);

    const updated = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const consolation = updated.structures.find((s) => s.stage === CONSOLATION);
    expect(consolation).toBeDefined();
    expect(consolation.matchUps.length).toEqual(7); // 8-draw SE bracket
  });

  it('attaches consolation to a LUCKY_DRAW main structure', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 11, drawType: LUCKY_DRAW }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructureId = drawDefinition.structures.find((s) => s.stage === MAIN)?.structureId;

    const result = tournamentEngine.addLinkedConsolationStructure({
      structureId: mainStructureId,
      structureType: AD_HOC,
      structureName: 'Lucky Consolation',
      drawSize: 9,
      drawId,
      links: [
        { sourceRoundNumber: 1, targetRoundNumber: 1 },
        { sourceRoundNumber: 2, targetRoundNumber: 1 },
        { sourceRoundNumber: 3, targetRoundNumber: 1 },
      ],
    });

    expect(result.success).toEqual(true);

    const updated = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const consolation = updated.structures.find((s) => s.stage === CONSOLATION);
    expect(consolation).toBeDefined();

    const loserLinks = updated.links.filter((l) => l.linkType === 'LOSER');
    expect(loserLinks.length).toEqual(3);
  });

  it('returns error when drawDefinition is missing', () => {
    const result = tournamentEngine.addLinkedConsolationStructure({
      structureType: AD_HOC,
      drawSize: 8,
      links: [],
    });

    expect(result.error).toBeDefined();
  });

  it('returns error when main structure is not found', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addLinkedConsolationStructure({
      structureId: 'nonexistent-structure-id',
      structureType: AD_HOC,
      drawSize: 8,
      drawId,
      links: [],
    });

    expect(result.error).toEqual(MISSING_STRUCTURE);
  });

  it('auto-resolves main structure when structureId not provided', () => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addLinkedConsolationStructure({
      structureType: AD_HOC,
      structureName: 'Auto Consolation',
      drawSize: 4,
      drawId,
      links: [{ sourceRoundNumber: 1, targetRoundNumber: 1 }],
    });

    expect(result.success).toEqual(true);

    const updated = tournamentEngine.getEvent({ drawId }).drawDefinition;
    expect(updated.structures.find((s) => s.stage === CONSOLATION)).toBeDefined();
  });
});
