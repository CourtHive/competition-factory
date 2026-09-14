import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { TEAM } from '@Constants/eventConstants';

it('changing value assignment of collectionDefinition that is part of collectionGroup will delete the group', () => {
  const deletedMatchUpIds: string[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [DELETED_MATCHUP_IDS]: (notices) => {
        notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
      },
    },
  });
  expect(result.success).toEqual(true);

  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
  });

  tournamentEngine.setState(tournamentRecord);

  // let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // const originalMatchUpsCount = matchUps.length;

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;

  const { drawDefaultTieFormat } = tournamentEngine.getTieFormat({ drawId });
  const { eventDefaultTieFormat } = tournamentEngine.getTieFormat({ eventId });
  expect(drawDefaultTieFormat).toBeUndefined();
  expect(eventDefaultTieFormat.winCriteria.valueGoal).toEqual(4);
  expect(eventDefaultTieFormat.collectionGroups.length).toEqual(1);

  // select one of the collectionDefinitions that is part of the collectionGroup
  const collectionId = eventDefaultTieFormat.collectionDefinitions.find(
    ({ collectionGroupNumber }) => collectionGroupNumber === 1,
  ).collectionId;

  expect(collectionId).not.toBeUndefined();

  result = tournamentEngine.modifyCollectionDefinition({
    scoreValue: 1,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(result.modifications.length).toEqual(4);
  expect(result.tieFormat.tieFormatName).toBeUndefined();
  expect(result.tieFormat.winCriteria.aggregateValue).toEqual(true);
  expect(result.tieFormat.collectionGroups.length).toEqual(0);
});

it('changing value assignment of collectionDefinition that is part of collectionGroup will delete the group', () => {
  const deletedMatchUpIds: string[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [DELETED_MATCHUP_IDS]: (notices) => {
        notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
      },
    },
  });
  expect(result.success).toEqual(true);

  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
  });

  tournamentEngine.setState(tournamentRecord);

  // let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  // const originalMatchUpsCount = matchUps.length;

  const { drawDefaultTieFormat } = tournamentEngine.getTieFormat({ drawId });
  const { eventDefaultTieFormat } = tournamentEngine.getTieFormat({ eventId });
  expect(drawDefaultTieFormat).toBeUndefined();
  expect(eventDefaultTieFormat.winCriteria.valueGoal).toEqual(4);

  // select one of the collectionDefinitions that is part of the collectionGroup
  const collectionId = eventDefaultTieFormat.collectionDefinitions.find(
    ({ collectionGroupNumber }) => collectionGroupNumber === 1,
  ).collectionId;

  expect(collectionId).not.toBeUndefined();

  result = tournamentEngine.modifyCollectionDefinition({
    scoreValue: 1,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(result.tieFormat.winCriteria.aggregateValue).toEqual(true);
  expect(result.tieFormat.collectionGroups.length).toEqual(0);
  expect(result.tieFormat.tieFormatName).toBeUndefined();
});
