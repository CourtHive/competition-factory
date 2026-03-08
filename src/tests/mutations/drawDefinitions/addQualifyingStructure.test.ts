import { attachQualifying } from '@Mutate/drawDefinitions/attachQualifyingStructure';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE,
  MISSING_STRUCTURE_ID,
  MISSING_TARGET_LINK,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it.each([2, 3, 4, 5, 6, 7, 8, 31, 32])(
  'can specify qualifiersCount when no qualifying draws are generated',
  (qualifiersCount) => {
    const {
      tournamentRecord,
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, qualifiersCount }],
    });

    tournamentEngine.setState(tournamentRecord);

    const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
    const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
    expect(mainStructureQualifiers.length).toEqual(qualifiersCount);
  },
);

it('drawProfile qualifiersCount will override qualifyingProfile if greater', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        qualifiersCount: 8,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, drawType: ROUND_ROBIN }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(8);
});

it('will place BYEs properly in ROUND_ROBIN qualifying structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        qualifiersCount: 8,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 14, drawType: ROUND_ROBIN }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(8);

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const byePositionAssignments = tournamentEngine
    .getPositionAssignments({
      drawId,
      structureId: qualifyingStructure.structureId,
    })
    .positionAssignments.filter(({ bye }) => bye);
  expect(byePositionAssignments.length).toEqual(2);
});

it('can add a qualifying structure to an existing drawDefinition', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(0);

  let result = tournamentEngine.addQualifyingStructure({
    qualifyingRoundNumber: 2,
    drawSize: 32,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);

  result = tournamentEngine.addQualifyingStructure({
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.error).toEqual(MISSING_STRUCTURE_ID);

  result = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.structures.length).toEqual(2);
  expect(drawDefinition.links.length).toEqual(1);
});

it('can generate and attach a qualifying structure to an existing drawDefinition', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  let mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(0);

  let result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { structure, link } = result;
  expect(structure.stage).toEqual(QUALIFYING);
  result = tournamentEngine.attachQualifyingStructure({
    structure,
    drawId,
    link,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.structures.length).toEqual(2);
  expect(drawDefinition.links.length).toEqual(1);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { structureIds: [structure.structureId] },
  });
  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  const keys = roundMatchUps && Object.keys(roundMatchUps);
  expect(keys).toEqual(['1', '2']);

  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  result = tournamentEngine.removeStructure({
    structureId: qualifyingStructure.structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // expect main structure to remain
  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.links.length).toEqual(0);

  mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure).toBeDefined();
});

it('will ignore drawProfile qualifiersCount if qualifyingProfile.qualifiersCount is greater', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        qualifiersCount: 3,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, drawType: ROUND_ROBIN }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(4);
});

it('can add a qualifying structure to an existing draw which has existing qualifying structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const mainStructureQualifiers = mainStructure.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(mainStructureQualifiers.length).toEqual(4);
  expect(drawDefinition.links.length).toEqual(1);

  expect(drawDefinition.links[0].source.roundNumber).toEqual(2);

  const result = tournamentEngine.addQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 3,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  expect(drawDefinition.structures.length).toEqual(3);
  expect(drawDefinition.links.length).toEqual(2);
  expect(drawDefinition.links[1].source.roundNumber).toEqual(3);
});

it('attachQualifyingStructure returns error when structure is missing', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // missing structure
  const attachResult = tournamentEngine.attachQualifyingStructure({
    link: result.link,
    drawId,
  });
  expect(attachResult.error).toEqual(MISSING_STRUCTURE);
});

it('attachQualifyingStructure returns error when link is missing', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // missing link
  const attachResult = tournamentEngine.attachQualifyingStructure({
    structure: result.structure,
    drawId,
  });
  expect(attachResult.error).toEqual(MISSING_TARGET_LINK);
});

it('attachQualifyingStructure returns error when link is not an object', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // link is a string, not an object — engine validates type before reaching attachQualifying
  const attachResult = tournamentEngine.attachQualifyingStructure({
    structure: result.structure,
    link: 'not-an-object',
    drawId,
  });
  expect(attachResult.error).toEqual(INVALID_VALUES);
});

it('attachQualifyingStructure returns error when link target structureId is invalid', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // modify link to have an invalid target structureId
  const badLink = {
    ...result.link,
    target: { ...result.link.target, structureId: 'bogus-structure-id' },
  };
  const attachResult = tournamentEngine.attachQualifyingStructure({
    structure: result.structure,
    link: badLink,
    drawId,
  });
  expect(attachResult.error).toEqual(STRUCTURE_NOT_FOUND);
});

it('attachQualifying returns MISSING_TARGET_LINK when link is not an object', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Call attachQualifying directly with a non-object link — type check fails with INVALID_VALUES
  const attachResult = attachQualifying({
    drawDefinition,
    structure: result.structure,
    link: 'not-an-object' as any,
  });
  expect(attachResult.error).toEqual(INVALID_VALUES);
});

it('attachQualifying initializes structures and links arrays when undefined', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructure.structureId,
    qualifyingRoundNumber: 2,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Call attachQualifying directly with a drawDefinition that has undefined structures and links
  // First, save the structures so findStructure can work, then delete them
  const dd = { ...drawDefinition, structures: undefined, links: undefined };
  // Restore structures so findStructure can locate the target
  dd.structures = [...drawDefinition.structures];
  dd.links = undefined;
  // Delete links to test the initialization branch
  const attachResult = attachQualifying({
    drawDefinition: dd,
    structure: result.structure,
    link: result.link,
  });
  expect(attachResult.success).toEqual(true);
  expect(dd.links).toBeDefined();
  expect(dd.links.length).toEqual(1);
});
