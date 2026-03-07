import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_ROUND_LOSER_CONSOLATION, MAIN, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { INVALID_CATEGORY } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

const MIXED_DOUBLES = 'Mixed Doubles';
const PRO_SET = 'SET1-S:8/TB7@7';

it('can add collectionDefinitions to tieFormat in a drawDefinition', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(matchUp.tieMatchUps.length).toEqual(9);

  const collectionDefinition = {
    collectionName: MIXED_DOUBLES,
    matchUpFormat: PRO_SET,
    matchUpType: DOUBLES,
    matchUpCount: 3,
    matchUpValue: 1,
  };

  // test adding to tieFormat on drawDefinition
  let result = tournamentEngine.addCollectionDefinition({
    uuids: ['a01', 'a02', 'a03'],
    collectionDefinition,
    drawId,
  });
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(7);
  expect(result.addedMatchUps.length).toEqual(3);
  const collectionOrders = result.tieFormat.collectionDefinitions.map(({ collectionOrder }) => collectionOrder);
  expect(collectionOrders).toEqual([1, 2, 3]);

  const matchUpIds = result.addedMatchUps.map(({ matchUpId }) => matchUpId);
  expect(matchUpIds).toEqual(['a03', 'a02', 'a01']);

  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat.collectionDefinitions.length).toEqual(3);
  expect(drawDefinition.tieFormat.winCriteria.valueGoal).toEqual(7);
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(5);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const collectionIds = drawDefinition.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const newOrder = [2, 3, 1];
  const orderMap = Object.assign(
    {},
    ...collectionIds.map((collectionId, i) => ({
      [collectionId]: newOrder[i],
    })),
  );

  result = tournamentEngine.orderCollectionDefinitions({ drawId, orderMap });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  drawDefinition.tieFormat.collectionDefinitions.forEach(({ collectionId }, i) =>
    expect(orderMap[collectionId]).toEqual(i + 1),
  );

  ({
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  expect(matchUp.tieMatchUps.length).toEqual(12);

  // in this case the matchUp does not have a tieFormat
  const matchUpId = matchUp.matchUpId;
  result = tournamentEngine.resetTieFormat({
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  // because the matchUp did not have a tieFormat there has been no change
  expect(matchUp.tieMatchUps.length).toEqual(12);
});

it('can add collectionDefinitions to tieFormat in a structure', () => {
  const matchUpAddNotices: number[] = [];
  const matchUpModifyNotices: any[] = [];

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

  const {
    drawIds: [drawId],
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions,
    drawProfiles: [
      {
        drawType: FIRST_ROUND_LOSER_CONSOLATION,
        tieFormatName: COLLEGE_D3,
        eventType: TEAM,
        drawSize: 4,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  expect(matchUpAddNotices).toEqual([40]);

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);
  const structureId = drawDefinition.structures[0].structureId;

  // 3 team matchUps
  expect(drawDefinition.structures[0].matchUps.length).toEqual(3);
  // 9 tieMatchUps within each team matchUp
  expect(drawDefinition.structures[0].matchUps[0].tieMatchUps.length).toEqual(9);

  const { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  let { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual(undefined);

  expect(firstRoundDualMatchUps.length).toEqual(2);

  const outcome = {
    winningSide: 1,
    score: {
      scoreStringSide1: '8-1',
      scoreStringSide2: '1-8',
      sets: [
        {
          setNumber: 1,
          side1Score: 8,
          side2Score: 1,
          winningSide: 1,
        },
      ],
    },
  };

  firstRoundDualMatchUps[0].tieMatchUps.forEach((matchUp) => {
    const { matchUpId } = matchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // confirm that team participant's drawPosition has advanced
  ({ matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  }));
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual([1]);

  let collectionDefinition = {
    collectionName: MIXED_DOUBLES,
    matchUpFormat: PRO_SET,
    matchUpType: DOUBLES,
    matchUpCount: 3,
    matchUpValue: 1,
  };

  const modifiedCount = matchUpModifyNotices.length;

  // test adding to tieFormat on drawDefinition
  let result = tournamentEngine.addCollectionDefinition({
    uuids: ['a01', 'a02', 'a03', 'a04', 'a05', 'a06'],
    collectionDefinition,
    structureId,
    drawId,
  });
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(7);
  expect(result.addedMatchUps.length).toEqual(6); // because one matchUp was completed already

  const matchUpIds = result.addedMatchUps.map(({ matchUpId }) => matchUpId);
  // prettier-ignore
  expect(matchUpIds).toEqual(['a06', 'a05', 'a04', 'a03', 'a02', 'a01']);

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(5);

  expect(drawDefinition.structures[0].tieFormat.collectionDefinitions.length).toEqual(3);
  expect(drawDefinition.structures[0].tieFormat.winCriteria.valueGoal).toEqual(7);

  expect(matchUpAddNotices).toEqual([40, 6]);
  // 2 of the three TEAM matchUps have been modified
  expect(matchUpModifyNotices.length - modifiedCount).toEqual(2);

  firstRoundDualMatchUps[1].tieMatchUps.forEach((matchUp) => {
    const { matchUpId } = matchUp;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // confirm that team participant's drawPosition has advanced
  ({ matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  }));
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual([1, 3]);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  let structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  const collectionIds = structure.tieFormat.collectionDefinitions.map(({ collectionId }) => collectionId);
  const newOrder = [2, 3, 1];
  const orderMap = Object.assign(
    {},
    ...collectionIds.map((collectionId, i) => ({
      [collectionId]: newOrder[i],
    })),
  );

  result = tournamentEngine.orderCollectionDefinitions({
    structureId,
    orderMap,
    drawId,
  });
  expect(result.success).toEqual(true);

  drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
  structure = drawDefinition.structures.find((structure) => structure.structureId === structureId);
  structure.tieFormat.collectionDefinitions.forEach(({ collectionId }, i) => {
    expect(orderMap[collectionId]).toEqual(i + 1);
  });

  collectionDefinition = {
    collectionName: 'More Singles',
    matchUpFormat: PRO_SET,
    matchUpType: SINGLES,
    matchUpCount: 3,
    matchUpValue: 1,
  };

  // test adding to tieFormat on event
  result = tournamentEngine.addCollectionDefinition({
    tieFormatName: 'New Format',
    collectionDefinition,
    eventId,
  });

  expect(result.addedMatchUps.length).toEqual(3);
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(7);
  expect(result.tieFormat.tieFormatName).toEqual('New Format');
});

it('added collectionDefinitions do not appear in inProgress matchUps', () => {
  const matchUpAddNotices: number[] = [];
  const matchUpModifyNotices: any[] = [];

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices.push(matchUps.length);
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

  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  expect(matchUpAddNotices).toEqual([30]);

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);
  const structureId = drawDefinition.structures[0].structureId;

  // 3 team matchUps
  expect(drawDefinition.structures[0].matchUps.length).toEqual(3);
  // 9 tieMatchUps within each team matchUp
  expect(drawDefinition.structures[0].matchUps[0].tieMatchUps.length).toEqual(9);

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  const { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual(undefined);

  expect(firstRoundDualMatchUps.length).toEqual(2);

  const outcome = {
    winningSide: 1,
    score: {
      scoreStringSide1: '8-1',
      scoreStringSide2: '1-8',
      sets: [
        {
          setNumber: 1,
          side1Score: 8,
          side2Score: 1,
          winningSide: 1,
        },
      ],
    },
  };

  let teamMatchUp = firstRoundDualMatchUps[0];
  const teamMatchUpId = teamMatchUp.matchUpId;
  expect(teamMatchUp.tieMatchUps.length).toEqual(9);

  const { matchUpId } = firstRoundDualMatchUps[0].tieMatchUps[0];
  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const collectionDefinition = {
    collectionName: MIXED_DOUBLES,
    matchUpFormat: PRO_SET,
    matchUpType: DOUBLES,
    matchUpCount: 3,
    matchUpValue: 1,
  };

  const modifiedCount = matchUpModifyNotices.length;

  // test adding to tieFormat on drawDefinition
  result = tournamentEngine.addCollectionDefinition({
    uuids: ['a01', 'a02', 'a03', 'a04', 'a05', 'a06'],
    updateInProgressMatchUps: false,
    collectionDefinition,
    structureId,
    drawId,
  });
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(7);
  expect(result.addedMatchUps.length).toEqual(6); // because one matchUp was in progress

  const matchUpIds = result.addedMatchUps.map(({ matchUpId }) => matchUpId);
  // prettier-ignore
  expect(matchUpIds).toEqual(['a06', 'a05', 'a04', 'a03', 'a02', 'a01']);

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(5);

  expect(drawDefinition.structures[0].tieFormat.collectionDefinitions.length).toEqual(3);
  expect(drawDefinition.structures[0].tieFormat.winCriteria.valueGoal).toEqual(7);

  expect(matchUpAddNotices).toEqual([30, 6]);
  // 2 of the 3 TEAM matchUps have been modified
  expect(matchUpModifyNotices.length - modifiedCount).toEqual(2);

  // confirm that team participant's drawPosition has advanced
  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  // the tieFormat of the in progress team matchUp should not have added a collectionDefinition
  firstRoundDualMatchUps.forEach((matchUp) => {
    if (matchUp.matchUpId === teamMatchUpId) {
      expect(matchUp.tieFormat.collectionDefinitions.length).toEqual(2);
      expect(matchUp.tieMatchUps.length).toEqual(9);
    } else {
      expect(matchUp.tieFormat.collectionDefinitions.length).toEqual(3);
      expect(matchUp.tieMatchUps.length).toEqual(12);
    }
  });

  result = tournamentEngine.resetTieFormat({
    matchUpId: teamMatchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }));

  teamMatchUp = firstRoundDualMatchUps.find((matchUp) => matchUp.matchUpId === teamMatchUpId);
  expect(teamMatchUp.tieMatchUps.length).toEqual(12);
});

it('properly calculates valueGoal when adding collectionDefinition with tiebreak match', () => {
  const tieFormatName = 'G14 Singles';
  const tieFormat = {
    collectionDefinitions: [
      {
        collectionName: 'G14 Doubles',
        collectionOrder: 1,
        matchUpType: 'DOUBLES',
        collectionId: 'c738fa5f-93a6-45c1-8bff-f17dbe1c1976',
        matchUpFormat: 'SET1-S:4/TB7',
        matchUpCount: 1,
        matchUpValue: 1,
        collectionValueProfiles: [],
      },
      {
        collectionName: 'G14 Singles',
        collectionOrder: 2,
        matchUpType: 'SINGLES',
        collectionId: '631742d0-ff2e-46a2-af84-25952cbfcc71',
        matchUpFormat: 'SET1-S:4/TB7',
        matchUpCount: 3,
        matchUpValue: 1,
        collectionValueProfiles: [],
      },
    ],
    winCriteria: {
      valueGoal: 3,
    },
    tieFormatName,
  };

  tournamentEngine.devContext(true);
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType: ROUND_ROBIN, eventType: TEAM, tieFormat }],
  });
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat.tieFormatName).toEqual(tieFormatName);
  expect(event.tieFormat.winCriteria).toEqual({ valueGoal: 3 });

  const [matchUp] = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps;
  const collectionId = '1d9791e8-61b5-47a9-b1b2-ab79b2753109';
  let params: any = {
    collectionDefinition: {
      collectionName: 'Tiebreak Match',
      processCodes: ['RANKING.IGNORE'],
      matchUpFormat: 'SET1-S:TB10',
      matchUpType: 'SINGLES',
      collectionOrder: 3,
      matchUpValue: 1,
      matchUpCount: 1,
      collectionId,
    },
    tieFormatName: 'added tie collection',
    matchUpId: matchUp.matchUpId,
    updateInProgressMatchUps: true,
    drawId,
  };
  result = tournamentEngine.addCollectionDefinition(params);
  expect(result.tieFormat.winCriteria).toEqual({ valueGoal: 3 });

  params = {
    tieFormatName: 'remove tie collection',
    updateInProgressMatchUps: true,
    matchUpId: matchUp.matchUpId,
    collectionId,
    drawId,
  };
  result = tournamentEngine.removeCollectionDefinition(params);
  expect(result.tieFormat.winCriteria).toEqual({ valueGoal: 3 });
});

it('can validate collectionDefinition.category when adding collectionDefinitions', () => {
  const ageCategoryCode = 'U18';
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 2, tieFormatName: COLLEGE_D3 }],
        category: { ageCategoryCode },
        eventType: TEAM,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let event = tournamentEngine.getEvent({ drawId }).event;
  expect(event.drawDefinitions[0].tieFormat.tieFormatName).toEqual('College D3');
  expect(event.category.ageCategoryCode).toEqual(ageCategoryCode);

  const tieFormatName = 'New tieFormatName';
  const params = {
    collectionDefinition: {
      category: { ageCategoryCode: 'U20' },
      matchUpFormat: 'SET1-S:TB10',
      matchUpType: 'SINGLES',
      matchUpValue: 1,
      matchUpCount: 1,
    },
    updateInProgressMatchUps: true,
    tieFormatName,
    drawId,
  };

  let result = tournamentEngine.addCollectionDefinition(params);
  expect(result.error).toEqual(INVALID_CATEGORY);
  event = tournamentEngine.getEvent({ drawId }).event;
  expect(event.drawDefinitions[0].tieFormat.tieFormatName).toEqual('College D3');

  params.collectionDefinition.category.ageCategoryCode = 'U16';
  result = tournamentEngine.addCollectionDefinition(params);
  expect(result.success).toEqual(true);
  expect(result.tieFormat.tieFormatName).toEqual(tieFormatName);
  event = tournamentEngine.getEvent({ drawId }).event;
  expect(event.drawDefinitions[0].tieFormat.tieFormatName).toEqual(tieFormatName);
});
