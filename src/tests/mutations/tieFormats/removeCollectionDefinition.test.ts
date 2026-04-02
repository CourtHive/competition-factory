import disableCalcTournamentRecord from '@Mutate/tieFormat/removeCollectionDisableAutoCalc.tods.json';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { COLLEGE_D3, USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { NO_MODIFICATIONS_APPLIED } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('can remove a collectionDefinition from a drawDefinition tieFormat', () => {
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
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const originalMatchUpsCount = matchUps.length;

  const { drawDefaultTieFormat } = tournamentEngine.getTieFormat({ drawId });
  const { eventDefaultTieFormat } = tournamentEngine.getTieFormat({ eventId });

  expect(drawDefaultTieFormat).toBeUndefined();
  expect(eventDefaultTieFormat.winCriteria.valueGoal).toEqual(5);

  const collectionId = eventDefaultTieFormat.collectionDefinitions[0].collectionId;
  result = tournamentEngine.removeCollectionDefinition({
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(result.tieFormat.tieFormatName).toBeUndefined();

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const prunedMatchUpsCount = matchUps.length;

  expect(deletedMatchUpIds.length).toEqual(3);
  expect(prunedMatchUpsCount).toEqual(originalMatchUpsCount - deletedMatchUpIds.length);
});

it('can remove a collectionDefinition from a structure tieFormat', () => {
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
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const originalMatchUpsCount = matchUps.length;

  const { drawDefaultTieFormat } = tournamentEngine.getTieFormat({ drawId });
  const { eventDefaultTieFormat } = tournamentEngine.getTieFormat({ eventId });

  expect(drawDefaultTieFormat).toBeUndefined();
  expect(eventDefaultTieFormat.winCriteria.valueGoal).toEqual(5);

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  let structure = drawDefinition.structures[0];
  expect([!!event.tieFormat, !!drawDefinition.tieFormat, !!structure.tieFormat]).toEqual([true, false, false]);

  // 1 team matchUps
  expect(drawDefinition.structures[0].matchUps.length).toEqual(1);
  // 9 tieMatchUps within each team matchUp
  expect(drawDefinition.structures[0].matchUps[0].tieMatchUps.length).toEqual(9);

  const collectionId = eventDefaultTieFormat.collectionDefinitions[0].collectionId;
  result = tournamentEngine.removeCollectionDefinition({
    structureId: structure.structureId,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(result.tieFormat.tieFormatName).toBeUndefined();

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  structure = drawDefinition.structures[0];
  expect([!!event.tieFormat, !!drawDefinition.tieFormat, !!structure.tieFormat]).toEqual([true, false, true]);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const prunedMatchUpsCount = matchUps.length;

  expect(deletedMatchUpIds.length).toEqual(3);
  expect(prunedMatchUpsCount).toEqual(originalMatchUpsCount - deletedMatchUpIds.length);
});

// * will also remove collectionGroupNumber from all relevant collectionDefinitions
// ...valueGoal needs to be recalculated
it('removing collectionDefinition that is part of collectionGroup will remove collectionGroup', () => {
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

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const originalMatchUpsCount = matchUps.length;

  const { drawDefaultTieFormat } = tournamentEngine.getTieFormat({ drawId });
  const { eventDefaultTieFormat } = tournamentEngine.getTieFormat({ eventId });
  expect(drawDefaultTieFormat).toBeUndefined();
  expect(eventDefaultTieFormat.winCriteria.valueGoal).toEqual(4);

  // select one of the collectionDefinitions that is part of the collectionGroup
  const collectionId = eventDefaultTieFormat.collectionDefinitions.find(
    ({ collectionGroupNumber }) => collectionGroupNumber === 1,
  ).collectionId;

  expect(collectionId).not.toBeUndefined();

  result = tournamentEngine.removeCollectionDefinition({
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(5);
  expect(result.tieFormat.tieFormatName).toBeUndefined();

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const prunedMatchUpsCount = matchUps.length;

  expect(deletedMatchUpIds.length).toEqual(1);
  expect(prunedMatchUpsCount).toEqual(originalMatchUpsCount - deletedMatchUpIds.length);
});

it('deleted collectionDefinitions are not removed from inProgress matchUps', () => {
  const matchUpModifyNotices: any[] = [];
  const deletedMatchUpIds: string[] = [];

  const subscriptions = {
    [DELETED_MATCHUP_IDS]: (notices) => {
      notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
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

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);

  let structure = drawDefinition.structures[0];
  const structureId = structure.structureId;

  expect([!!event.tieFormat, !!drawDefinition.tieFormat, !!structure.tieFormat]).toEqual([true, false, false]);

  const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

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

  let teamMatchUp = firstRoundDualMatchUps[0];
  const teamMatchUpId = teamMatchUp.matchUpId;
  expect(teamMatchUp.tieMatchUps.length).toEqual(9);

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

  const { matchUpId } = firstRoundDualMatchUps[0].tieMatchUps[0];
  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const modifiedCount = matchUpModifyNotices.length;

  // test removing to tieFormat on drawDefinition
  result = tournamentEngine.removeCollectionDefinition({
    updateInProgressMatchUps: false,
    collectionId,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.targetMatchUps.length).toEqual(2);
  expect(result.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(result.deletedMatchUpIds.length).toEqual(6); // because one matchUp was in progress

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(drawDefinition.tieFormat).toBeUndefined();
  expect(event.tieFormat.collectionDefinitions.length).toEqual(2);
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(5);

  structure = drawDefinition.structures[0];
  expect(structure.tieFormat.collectionDefinitions.length).toEqual(1);

  expect([!!event.tieFormat, !!drawDefinition.tieFormat, !!structure.tieFormat]).toEqual([true, false, true]);

  expect(drawDefinition.structures[0].tieFormat.collectionDefinitions.length).toEqual(1);
  expect(drawDefinition.structures[0].tieFormat.winCriteria.valueGoal).toEqual(4);

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
      expect(matchUp.tieFormat.collectionDefinitions.length).toEqual(1);
      expect(matchUp.tieMatchUps.length).toEqual(6);
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
  expect(teamMatchUp.tieMatchUps.length).toEqual(6);
});

test('removing collection when matchUps are scored and team participant has advanced', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps[0].winningSide).toBeUndefined();

  let { matchUps: secondRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  });
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual(undefined);

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

  for (const tieMatchUp of firstRoundDualMatchUps[0].tieMatchUps) {
    const matchUpId = tieMatchUp.matchUpId;
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;

  expect(firstRoundDualMatchUps[0].winningSide).toEqual(1);

  secondRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  }).matchUps;

  expect(firstRoundDualMatchUps[0].score.scoreStringSide1).toEqual('9-0');
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual([1]);

  const collectionId = firstRoundDualMatchUps[0].tieMatchUps[0].collectionId;
  const matchUpId = firstRoundDualMatchUps[0].matchUpId;
  let result = tournamentEngine.removeCollectionDefinition({
    updateInProgressMatchUps: false,
    collectionId,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(NO_MODIFICATIONS_APPLIED);

  result = tournamentEngine.removeCollectionDefinition({
    updateInProgressMatchUps: true,
    collectionId,
    matchUpId,
    drawId,
  });
  expect(result.error).toEqual(NO_MODIFICATIONS_APPLIED);

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;

  expect(firstRoundDualMatchUps[0].score.scoreStringSide1).toEqual('9-0');
  expect(secondRoundDualMatchUps[0].drawPositions).toEqual([1]);

  secondRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [2],
    },
  }).matchUps;

  expect(secondRoundDualMatchUps[0].drawPositions).toEqual([1]);
});

test('removing collectionDefinition will not recalculate score or remove advanced winner if there is a manual scoring override', () => {
  let result = tournamentEngine.setState(disableCalcTournamentRecord);
  expect(result.success).toEqual(true);
  result = tournamentEngine.attachPolicies({ policyDefinitions });
  expect(result.success).toEqual(true);

  const matchUpId = '919dfd11-9434-4d1d-80c4-f46c8837f7b5';
  const drawId = '5c20bb27-bdb7-489a-b68d-3646ffa11023';
  const params = {
    collectionId: '9798bdd1-acc9-4b27-8730-a0f2f7c9002e',
    updateInProgressMatchUps: true,
    tieFormatName: 'USTA_COLLEGE',
    matchUpId,
    drawId,
  };

  result = tournamentEngine.findMatchUp({ matchUpId, drawId });
  expect(result.matchUp.winningSide).toEqual(1);

  const round2MatchUpId = '87ff5673-aa79-4a1e-991f-56a0c410d8dc';
  result = tournamentEngine.findMatchUp({ matchUpId: round2MatchUpId, drawId });
  expect(result.matchUp.drawPositions).toEqual([7]);

  result = tournamentEngine.removeCollectionDefinition(params);
  expect(result.success).toEqual(true);

  tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
  });
  result = tournamentEngine.findMatchUp({ matchUpId, drawId });
  expect(result.matchUp.winningSide).toEqual(1);

  result = tournamentEngine.findMatchUp({ matchUpId: round2MatchUpId, drawId });
  expect(result.matchUp.drawPositions).toEqual([7]);
});
