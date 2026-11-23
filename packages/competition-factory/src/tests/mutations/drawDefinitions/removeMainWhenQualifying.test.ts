import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { DRAW, MAIN, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { CANNOT_REMOVE_MAIN_STRUCTURE } from '@Constants/errorConditionConstants';

it('allows deletion of non-qualifying structures', () => {
  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        ignoreDefaults: true,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingRoundNumber: 2 }],
          },
        ],
      },
    ],
  });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = result;

  tournamentEngine.devContext(true).setState(tournamentRecord);
  const eventResult = tournamentEngine.getEvent({ drawId });
  expect(eventResult.drawDefinition.entries.length).toEqual(16);
  expect(eventResult.event.entries.length).toEqual(16);
  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  expect(matchUps.length).toEqual(12);

  const entryStages = unique(eventResult.event.entries.map(({ entryStage }) => entryStage));
  expect(entryStages).toEqual([QUALIFYING]);

  let mainStructure = eventResult.drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(0);
  const mainStructureId = mainStructure.structureId;

  const qualifyingStructure = eventResult.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.matchUps.length).toEqual(12);

  const links = eventResult.drawDefinition.links;
  expect(links.length).toEqual(1);
  expect(links[0].linkType).toEqual(WINNER);

  expect(links[0].source.structureId).toEqual(qualifyingStructure.structureId);

  expect(links[0].target.feedProfile).toEqual(DRAW);
  expect(links[0].target.structureId).toEqual(mainStructure.structureId);
  expect(links[0].target.roundNumber).toEqual(1);

  result = tournamentEngine.generateDrawTypeAndModifyDrawDefinition({
    modifyOriginal: false,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.links.length).toEqual(1);

  mainStructure = result.drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.positionAssignments.length).toEqual(32);
  expect(mainStructure.matchUps.length).toEqual(31);

  let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.positionAssignments.length).toEqual(0);
  expect(mainStructure.matchUps.length).toEqual(0);

  result = tournamentEngine.generateDrawTypeAndModifyDrawDefinition({
    modifyOriginal: true,
    drawSize: 32,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.drawDefinition.links.length).toEqual(1);

  mainStructure = result.drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.positionAssignments.length).toEqual(32);
  expect(mainStructure.matchUps.length).toEqual(31);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.positionAssignments.length).toEqual(32);
  expect(mainStructure.matchUps.length).toEqual(31);

  result = tournamentEngine.removeStructure({
    structureId: mainStructure.structureId,
    drawId: result.drawDefinition.drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.removedStructureIds.length).toEqual(0);
  expect(result.removedMatchUpIds.length).toEqual(31);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.positionAssignments.length).toEqual(0);
  expect(mainStructure.matchUps.length).toEqual(0);

  // the original structure has been modified, not replaced
  expect(mainStructure.structureId).toEqual(mainStructureId);
  expect(drawDefinition.links.length).toEqual(1);
});

it('will not remove MAIN structure when there is no QUALIFYING structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const result = tournamentEngine.removeStructure({
    drawDefinition,
    structureId,
  });

  expect(result.error).toEqual(CANNOT_REMOVE_MAIN_STRUCTURE);
});
