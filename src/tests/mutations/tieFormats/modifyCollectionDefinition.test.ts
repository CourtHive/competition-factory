import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { TIE_FORMAT_MODIFICATIONS } from '@Constants/extensionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  INVALID_MATCHUP,
  INVALID_TIE_FORMAT,
  INVALID_VALUES,
  NOT_FOUND,
  NOT_IMPLEMENTED,
} from '@Constants/errorConditionConstants';

it('can modify collectionDefinitions for a tieFormat on a drawDefinition', () => {
  const policyDefinitions = { audit: { [TIE_FORMAT_MODIFICATIONS]: true } };
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'New Name',
    matchUpValue: 3,
    drawId,
  });
  expect(result.error).toEqual(NOT_FOUND);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

  const newCollectionName = 'New Name';
  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  let definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.collectionName).toEqual(newCollectionName);

  result = tournamentEngine.modifyCollectionDefinition({
    matchUpValue: 2,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.matchUpValue).toEqual(2);

  result = tournamentEngine.modifyCollectionDefinition({
    matchUpValue: 'x',
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionValue: 1,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.collectionValue).toEqual(1);
  expect(definition.matchUpValue).toBeUndefined();

  result = tournamentEngine.modifyCollectionDefinition({
    scoreValue: 1,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.collectionValue).toBeUndefined();
  expect(definition.scoreValue).toEqual(1);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionId,
    setValue: 1,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.scoreValue).toBeUndefined();
  expect(definition.setValue).toEqual(1);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionValueProfiles: [
      { collectionPosition: 1, matchUpValue: 3 },
      { collectionPosition: 2, matchUpValue: 1 },
      { collectionPosition: 3, matchUpValue: 1 },
    ],
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  definition = drawDefinition.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(definition.setValue).toBeUndefined();
  expect(definition.collectionValueProfiles).not.toBeUndefined();

  result = tournamentEngine.modifyCollectionDefinition({
    collectionValueProfiles: [
      { collectionPosition: 1, matchUpValue: 3 },
      { collectionPosition: 1, matchUpValue: 1 },
      { collectionPosition: 1, matchUpValue: 1 },
    ],
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionValueProfiles: [
      { collectionPosition: 1, matchUpValue: 3 },
      { collectionPosition: 2, matchUpValue: 2 },
    ],
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('can modify collectionDefinitions for a tieFormat on a structure', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'New Name',
    drawId,
  });
  expect(result.error).toEqual(NOT_FOUND);

  const { event } = tournamentEngine.getEvent({ drawId });
  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  const structureId = drawDefinition.structures[0].structureId;
  const targetCollection = event.tieFormat.collectionDefinitions[0];
  const collectionId = targetCollection.collectionId;

  let matchUp = drawDefinition.structures[0].matchUps[0];
  expect(matchUp.tieFormat).toBeUndefined();

  const newCollectionName = 'New Name';
  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const structure = drawDefinition.structures[0];
  expect(structure.matchUps[0].tieMatchUps.length).toEqual(9);

  const collectionDefinition = structure.tieFormat.collectionDefinitions.find(
    (collectionDefinition) => collectionDefinition.collectionId === collectionId,
  );
  expect(collectionDefinition.collectionName).toEqual(newCollectionName);

  matchUp = structure.matchUps[0];
  expect(matchUp.tieFormat).toBeUndefined();

  let matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;
  expect(matchUps[0].tieFormat).not.toBeUndefined();
  expect(matchUps[0].matchUpId).toEqual(matchUp.matchUpId);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    collectionId,
    structureId,
    setValue: 1,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;
  expect(matchUps[0].tieFormat.winCriteria.aggregateValue).toEqual(true);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    matchUpValue: 1,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;
  expect(matchUps[0].tieFormat.winCriteria.valueGoal).toEqual(5);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    collectionValue: 1,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;
  expect(matchUps[0].tieFormat.winCriteria.valueGoal).toEqual(4);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: newCollectionName,
    scoreValue: 1,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;
  expect(matchUps[0].tieFormat.winCriteria.aggregateValue).toEqual(true);

  const outcome = {
    score: {
      sets: [
        {
          setNumber: 1,
          side1Score: 10,
          side2Score: 12,
        },
      ],
    },
  };

  const { matchUpId } = matchUps[0].tieMatchUps[0];
  result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck',
    scoreValue: 2,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCount).toEqual(1);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck',
    scoreValue: 2,
    collectionId,
    structureId,
    matchUpId, // this is a tieMatchUp so expect an error
    drawId,
  });
  expect(result.error).toEqual(INVALID_MATCHUP);

  result = tournamentEngine.modifyCollectionDefinition({
    matchUpId: matchUps[0].matchUpId, // the TEAM matchUp, not a tieMatchUp
    collectionName: 'progressCheck2',
    updateInProgressMatchUps: true,
    scoreValue: 2,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCount).toEqual(1);

  // No change is made
  result = tournamentEngine.modifyCollectionDefinition({
    matchUpId: matchUps[0].matchUpId, // the TEAM matchUp, not a tieMatchUp
    collectionName: 'progressCheck2',
    scoreValue: 2,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck3',
    updateInProgressMatchUps: true,
    eventId: event.eventId,
    scoreValue: 2,
    collectionId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCount).toEqual(1);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck4',
    updateInProgressMatchUps: true,
    eventId: event.eventId,
    scoreValue: 2,
    collectionId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCount).toEqual(1);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck5',
    scoreValue: 2,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCount).toEqual(0);
  expect(result.modifiedStructuresCount).toEqual(0);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'progressCheck6',
    updateInProgressMatchUps: true,
    scoreValue: 2,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.modifiedStructuresCount).toEqual(1);
  expect(result.modifiedCount).toEqual(1);
  expect(result.success).toEqual(true);

  // turn on logging for matchUpCount modification devlopment
  tournamentEngine.devContext({ matchUpCount: true });

  expect(targetCollection.matchUpType).toEqual(DOUBLES_MATCHUP);

  result = tournamentEngine.modifyCollectionDefinition({
    updateInProgressMatchUps: true,
    matchUpType: SINGLES_MATCHUP,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.error).toEqual(NOT_IMPLEMENTED);

  // attempt to modify the tieFormat on the structure
  result = tournamentEngine.modifyCollectionDefinition({
    updateInProgressMatchUps: true,
    matchUpCount: 5,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedStructuresCount).toEqual(1);
  // the only matchUp already has an attached tieFormat
  expect(result.modifiedMatchUpsCount).toEqual(0);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const targetStructure = drawDefinition.structures.find((s) => s.structureId === structureId);

  // structure.tieFormat has been updated
  expect(
    targetStructure.tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId).matchUpCount,
  ).toEqual(5);

  // expect no change on matchUp because it already had tieFormat attached
  expect(targetStructure.matchUps[0].tieMatchUps.length).toEqual(9);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  // expect no change on matchUp because it already had tieFormat attached
  expect(
    matchUps[0].tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId).matchUpCount,
  ).toEqual(3);

  const targetMatchUpId = matchUps[0].matchUpId;
  expect(matchUps[0].tieMatchUps.length).toEqual(9);

  result = tournamentEngine.modifyCollectionDefinition({
    updateInProgressMatchUps: true,
    matchUpId: targetMatchUpId,
    matchUpCount: 5,
    collectionId,
    drawId,
  });
  expect(result.addedMatchUpsCount).toEqual(2);
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  let targetMatchUp = matchUps.find((m) => m.matchUpId === targetMatchUpId);

  expect(
    targetMatchUp.tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId).matchUpCount,
  ).toEqual(5);

  expect(targetMatchUp.tieMatchUps.length).toEqual(11);

  let targetTieMatchUps = targetMatchUp.tieMatchUps.filter((tieMatchUp) => tieMatchUp.collectionId === collectionId);
  expect(targetTieMatchUps.length).toEqual(5);
  expect(targetTieMatchUps.map(xa('collectionPosition'))).toEqual([1, 2, 3, 4, 5]);

  [0, 2, 4]
    .map((i) => targetTieMatchUps[i].matchUpId)
    .forEach((matchUpId) => {
      const matchUpStatusResult = tournamentEngine.setMatchUpStatus({
        matchUpId,
        outcome,
        drawId,
      });
      expect(matchUpStatusResult.success).toEqual(true);
    });

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
  }).matchUps;

  targetMatchUp = matchUps.find((m) => m.matchUpId === targetMatchUpId);

  targetTieMatchUps = targetMatchUp.tieMatchUps.filter(
    (matchUp) => matchUp.collectionId === collectionId && matchUp.matchUpStatus === TO_BE_PLAYED,
  );
  expect(targetTieMatchUps.length).toEqual(2);

  result = tournamentEngine.modifyCollectionDefinition({
    updateInProgressMatchUps: true,
    matchUpId: targetMatchUpId,
    matchUpCount: 1,
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);

  /**
  result = tournamentEngine.modifyCollectionDefinition({
    updateInProgressMatchUps: true,
    matchUpId: targetMatchUpId,
    matchUpCount: 1,
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
  */
});
