import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { modifyTieFormat as modifyTieFormatFn } from '@Mutate/tieFormat/modifyTieFormat';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { INVALID_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

it('can add collectionDefinitions to tieFormat in a structure', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        tieFormatName: COLLEGE_D3,
        eventType: TEAM,
        drawSize,
      },
    ],
  });

  const setStateResult = tournamentEngine.devContext(true).setState(tournamentRecord);
  expect(setStateResult.success).toEqual(true);

  const originalMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(originalMatchUps.length).toEqual(30);
  const teamMatchUps = originalMatchUps.filter(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
  expect(teamMatchUps.length).toEqual(drawSize - 1);
  const originalTieMatchUpsCount = teamMatchUps[0].tieMatchUps.length;
  expect(originalTieMatchUpsCount).toEqual(9);

  let tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  expect(tieFormatResult.structureDefaultTieFormat).toBeUndefined();
  expect(tieFormatResult.drawDefaultTieFormat).toBeUndefined();
  const tieFormat = tieFormatResult.tieFormat;
  expect(tieFormat.winCriteria.valueGoal).toEqual(5);

  const matchUpModifyNotices: any[] = [];
  const matchUpAddNotices: number[] = [];

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => {
          const count: number = item.matchUps.length;
          matchUpAddNotices.push(count);
        });
      }
    },
    modifyMatchUp: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          matchUpModifyNotices.push(matchUp);
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  const modifiedTieFormat = copyTieFormat(tieFormat);
  let result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(matchUpModifyNotices.length).toEqual(0);
  expect(matchUpAddNotices.length).toEqual(0);
  expect(result.info).toEqual('Nothing to do');

  const matchUpCount = 2;
  const collectionId = 'newCollectionId';
  modifiedTieFormat.collectionDefinitions.push({
    matchUpFormat: 'SET3-S:6/TB7',
    collectionName: 'New Name',
    matchUpType: 'DOUBLES',
    collectionValue: 2,
    gender: 'FEMALE',
    collectionId,
    matchUpCount,
  });
  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  expect(tieFormatResult.tieFormat).toEqual(result.processedTieFormat);

  // tieFormatName should have been removed
  expect(result.modifications.length).toBeGreaterThan(0);
  expect(result.processedTieFormat.tieFormatName).toBeUndefined();
  tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  expect(tieFormatResult.tieFormat.winCriteria.valueGoal).toEqual(6);

  expect(matchUpModifyNotices.length).toEqual(3);
  expect(matchUpAddNotices).toEqual([matchUpCount * teamMatchUps.length]); // matchUpCount * number of ties

  for (const notice of matchUpModifyNotices) {
    // each tie has had matchUpCount tieMatchUps added
    expect(notice.tieMatchUps.length).toEqual(originalTieMatchUpsCount + matchUpCount);
  }

  tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  let target = tieFormatResult.tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId);
  expect(target.collectionValue).toEqual(2);
  expect(target.matchUpValue).toBeUndefined();

  let targetCollectionDefinition = result.processedTieFormat.collectionDefinitions.find(
    (def) => def.collectionId === collectionId,
  );
  targetCollectionDefinition.matchUpValue = 1;
  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: result.processedTieFormat,
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);

  tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  target = tieFormatResult.tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId);
  expect(target.collectionValue).toEqual(2);
  expect(target.matchUpValue).toBeUndefined();

  targetCollectionDefinition = tieFormatResult.tieFormat.collectionDefinitions.find(
    (def) => def.collectionId === collectionId,
  );
  targetCollectionDefinition.collectionValue = undefined;
  targetCollectionDefinition.matchUpValue = 1;

  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: tieFormatResult.tieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  target = tieFormatResult.tieFormat.collectionDefinitions.find((def) => def.collectionId === collectionId);
  expect(target.collectionValue).toBeUndefined();
  expect(target.matchUpValue).toEqual(1);
});

it('returns INVALID_TIE_FORMAT when modifiedTieFormat fails validation', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  // Pass an invalid tieFormat (missing winCriteria)
  let result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: { collectionDefinitions: [] },
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);

  // Pass a non-object tieFormat
  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: 'not a tie format',
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);

  // Pass tieFormat with missing collectionDefinitions
  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: { winCriteria: { valueGoal: 5 } },
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
});

it('returns error when getTieFormat fails (no drawDefinition for structureId)', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Calling with eventId only (no drawId) but eventId doesn't match an event with tieFormat
  // causes getTieFormat to return MISSING_TIE_FORMAT error
  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId: 'nonexistent-event-id',
  });
  expect(result.error).toBeDefined();
});

it('returns INVALID_TIE_FORMAT when comparison finds invalid value assignments', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  // Test that setting both matchUpValue and collectionValue triggers validation error
  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);
  modifiedTieFormat.collectionDefinitions[0].collectionValue = 2;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
});

it('returns INVALID_TIE_FORMAT via comparison.invalid path', () => {
  // This test crafts a scenario where the existing (ancestor) tieFormat has a collection
  // with no value assignments. This is achieved by directly mutating the stored
  // tieFormat on the event. The modified tieFormat is valid, but compareTieFormats
  // detects invalid value assignments on the ancestor side.
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  // Get the event and drawDefinition from the internal state
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });

  // Find where the tieFormat is stored
  const tieFormatSource = event.tieFormat ?? drawDefinition?.tieFormat;
  expect(tieFormatSource).toBeDefined();

  // Corrupt the ancestor tieFormat: remove value assignments from first collection
  const existingCollection = tieFormatSource.collectionDefinitions[0];
  delete existingCollection.matchUpValue;
  delete existingCollection.collectionValue;
  delete existingCollection.scoreValue;
  delete existingCollection.setValue;
  delete existingCollection.collectionValueProfiles;

  // Build a valid modified tieFormat (with proper matchUpValue)
  const modifiedTieFormat = copyTieFormat(tieFormatSource);
  modifiedTieFormat.collectionDefinitions[0].matchUpValue = 1;

  const result: any = modifyTieFormatFn({
    modifiedTieFormat,
    tournamentRecord,
    drawDefinition,
    eventId,
    event,
  });
  expect(result.error).toEqual(INVALID_TIE_FORMAT);
});

it('applies tieFormatName change when modifiedTieFormat has a new name', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Change the tieFormatName and modify matchUpValue (not adding a second value type)
  modifiedTieFormat.tieFormatName = 'Custom Format Name';
  modifiedTieFormat.collectionDefinitions[0].matchUpValue = 2;

  // Recalculate winCriteria to stay valid
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.processedTieFormat.tieFormatName).toEqual('Custom Format Name');
  expect(result.modifications).toContainEqual({ tieFormatName: 'Custom Format Name' });
});

it('removes a collectionDefinition via modifyTieFormat', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const matchUpDeleteNotices: string[][] = [];
  const subscriptions = {
    deletedMatchUpIds: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach((item) => {
          matchUpDeleteNotices.push(item.matchUpIds);
        });
      }
    },
  };
  setSubscriptions({ subscriptions });

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const originalCollectionCount = tieFormatResult.tieFormat.collectionDefinitions.length;
  expect(originalCollectionCount).toBeGreaterThan(1);

  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Remove the last collection definition
  const removedCollection = modifiedTieFormat.collectionDefinitions.pop();
  expect(removedCollection).toBeDefined();

  // Recalculate winCriteria for the modified format
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    const val = cd.collectionValue ?? (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
    totalValue += val;
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.processedTieFormat.collectionDefinitions.length).toEqual(originalCollectionCount - 1);

  // tieFormatName should have been removed since modifications occurred without new name
  expect(result.processedTieFormat.tieFormatName).toBeUndefined();
  expect(result.modifications.length).toBeGreaterThan(0);

  // Deleted matchUp notifications should have fired
  expect(matchUpDeleteNotices.length).toBeGreaterThan(0);
});

it('removes tieFormatName when only modifications are made (no name change)', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Modify an existing collection's matchUpValue but keep the same tieFormatName
  // COLLEGE_D3 collections have matchUpValue: 1
  modifiedTieFormat.collectionDefinitions[0].matchUpValue = 2;

  // Recalculate winCriteria
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  // tieFormatName removed because modifications without new name
  expect(result.processedTieFormat.tieFormatName).toBeUndefined();
  expect(result.modifications).toContainEqual('tieFormatName removed: modifications without new tieFormatName');
});

it('handles collectionName consideration in comparison', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Only change collectionName — without collectionName consideration, it should be "nothing to do"
  modifiedTieFormat.collectionDefinitions[0].collectionName = 'Renamed Collection';
  let result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  // Without collectionName consideration, comparison doesn't see a difference for the value comparison
  // but modifyCollectionDefinition will pick up the name change
  expect(result.success).toEqual(true);

  // With collectionName consideration, it should detect the difference
  const freshTieFormat = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat2 = copyTieFormat(freshTieFormat.tieFormat);
  modifiedTieFormat2.collectionDefinitions[0].collectionName = 'Another Renamed Collection';

  result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat: modifiedTieFormat2,
    considerations: { collectionName: true },
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('removes tieFormatName when collections are removed without new name', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Remove a collection — this tests the removedCollectionIds.length branch in the else-if
  const removedDef = modifiedTieFormat.collectionDefinitions.shift();
  expect(removedDef).toBeDefined();

  // Recalculate winCriteria
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  // tieFormatName removed since there are removedCollectionIds but no new name
  expect(result.processedTieFormat.tieFormatName).toBeUndefined();
  expect(result.modifications).toContainEqual('tieFormatName removed: modifications without new tieFormatName');
});

it('handles tieFormatComparison parameter when removing collections', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Remove one collection with tieFormatComparison enabled
  modifiedTieFormat.collectionDefinitions.pop();

  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    tieFormatComparison: true,
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('simultaneously adds and removes collections', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);
  const originalCount = modifiedTieFormat.collectionDefinitions.length;

  // Remove the first collection
  modifiedTieFormat.collectionDefinitions.shift();

  // Add a new collection
  modifiedTieFormat.collectionDefinitions.push({
    matchUpFormat: 'SET3-S:6/TB7',
    collectionName: 'Mixed Doubles',
    collectionId: 'addedMixed',
    matchUpType: 'DOUBLES',
    matchUpValue: 1,
    matchUpCount: 1,
  });

  // Recalculate winCriteria
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
  // Total collection count should remain the same (1 removed + 1 added)
  expect(result.processedTieFormat.collectionDefinitions.length).toEqual(originalCount);
  // The added collection should be present
  const addedCollection = result.processedTieFormat.collectionDefinitions.find(
    (cd) => cd.collectionId === 'addedMixed',
  );
  expect(addedCollection).toBeDefined();
  expect(addedCollection.collectionName).toEqual('Mixed Doubles');
});

it('handles modifyTieFormat with matchUpId scope', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  // Find a team matchUp
  const allMatchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const teamMatchUp = allMatchUps.find(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
  expect(teamMatchUp).toBeDefined();

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId, matchUpId: teamMatchUp.matchUpId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Modify matchUpValue at the matchUp level
  modifiedTieFormat.collectionDefinitions[0].matchUpValue = 3;

  // Recalculate winCriteria
  let totalValue = 0;
  for (const cd of modifiedTieFormat.collectionDefinitions) {
    totalValue += (cd.matchUpValue ?? 0) * (cd.matchUpCount ?? 0);
  }
  modifiedTieFormat.winCriteria.valueGoal = Math.floor(totalValue / 2) + 1;

  const result = tournamentEngine.modifyTieFormat({
    matchUpId: teamMatchUp.matchUpId,
    modifiedTieFormat,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('reorders collectionDefinitions by collectionOrder in processedTieFormat', () => {
  const drawSize = 4;
  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ tieFormatName: COLLEGE_D3, eventType: TEAM, drawSize }],
  });

  tournamentEngine.devContext(true).setState(tournamentRecord);

  const tieFormatResult = tournamentEngine.getTieFormat({ eventId, drawId });
  const modifiedTieFormat = copyTieFormat(tieFormatResult.tieFormat);

  // Reverse the collectionOrder values to trigger reordering
  const collectionCount = modifiedTieFormat.collectionDefinitions.length;
  modifiedTieFormat.collectionDefinitions.forEach((cd, i) => {
    cd.collectionOrder = collectionCount - i;
  });

  // Also change a value so comparison detects a difference
  modifiedTieFormat.tieFormatName = 'Reordered Format';

  const result = tournamentEngine.modifyTieFormat({
    modifiedTieFormat,
    eventId,
    drawId,
    considerations: { collectionOrder: true },
  });
  expect(result.success).toEqual(true);

  // Verify collectionOrder values are sequential 1..n
  const orders = result.processedTieFormat.collectionDefinitions.map((cd) => cd.collectionOrder);
  expect(orders).toEqual(orders.map((_, i) => i + 1));
  expect(result.processedTieFormat.tieFormatName).toEqual('Reordered Format');
});
