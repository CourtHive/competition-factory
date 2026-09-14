import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('can remove collectionGroups from tieFormats', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, tieFormatName: USTA_BREWER_CUP, eventType: TEAM }],
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(drawDefinition.tieFormat).toBeUndefined();

  let result = tournamentEngine.removeCollectionGroup({
    collectionGroupNumber: 1,
    tieFormatName: 'Pruned',
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.modifiedCollectionIds.length).toEqual(3);

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(drawDefinition.tieFormat.winCriteria.valueGoal).toEqual(5);
  expect(drawDefinition.tieFormat.tieFormatName).toEqual('Pruned');
  expect(drawDefinition.tieFormat.collectionGroups.length).toEqual(0);

  const groupDefinition = {
    groupName: 'Doubles',
    groupValue: 1,
    winCriteria: {
      valueGoal: 2,
    },
  };
  result = tournamentEngine.addCollectionGroup({
    collectionIds: result.modifiedCollectionIds,
    tieFormatName: 'Swelled',
    groupDefinition,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(drawDefinition.tieFormat.tieFormatName).toEqual('Swelled');
  expect(drawDefinition.tieFormat.collectionGroups.length).toEqual(1);
  expect(drawDefinition.tieFormat.winCriteria.valueGoal).toEqual(4);
});

it('can remove collectionGroups and recalculate score in matchUps which are in progress', () => {
  const matchUpModifyNotices: any[] = [];

  const subscriptions = {
    modifyMatchUp: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          const { matchUpType, matchUpStatusCodes, score } = matchUp;
          if (matchUpStatusCodes || score)
            matchUpModifyNotices.push([matchUpType, matchUpStatusCodes, score].filter(Boolean));
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, tieFormatName: USTA_BREWER_CUP, eventType: TEAM }],
    policyDefinitions,
  });

  tournamentEngine.setState(tournamentRecord);

  let { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(drawDefinition.tieFormat).toBeUndefined();

  let { matchUps: firstRoundDualMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  });

  expect(firstRoundDualMatchUps.map(({ score }) => score).filter(Boolean).length).toEqual(0);

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
  expect(teamMatchUp.tieMatchUps.length).toEqual(9);
  expect(teamMatchUp.score).toEqual(undefined);

  const tieMatchUp = firstRoundDualMatchUps[0].tieMatchUps.find(({ matchUpType }) => matchUpType === DOUBLES);
  const { matchUpId } = tieMatchUp;

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(matchUpModifyNotices.length).toEqual(2);

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
    inContext: false,
  }).matchUps;

  expect(firstRoundDualMatchUps.map(({ score }) => score).filter(Boolean).length).toEqual(1);

  expect(firstRoundDualMatchUps.map(({ tieFormat }) => tieFormat).filter(Boolean).length).toEqual(1);

  teamMatchUp = firstRoundDualMatchUps.find((matchUp) => matchUp.matchUpId === teamMatchUp.matchUpId);
  expect(teamMatchUp.score).not.toBeUndefined();

  result = tournamentEngine.removeCollectionGroup({
    collectionGroupNumber: 1,
    tieFormatName: 'Pruned',
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(matchUpModifyNotices.length).toEqual(3);

  ({ drawDefinition, event } = tournamentEngine.getEvent({ drawId }));
  expect(event.tieFormat.winCriteria.valueGoal).toEqual(4);
  expect(drawDefinition.tieFormat.winCriteria.valueGoal).toEqual(5);
  expect(drawDefinition.tieFormat.tieFormatName).toEqual('Pruned');

  firstRoundDualMatchUps = tournamentEngine.allTournamentMatchUps({
    contextFilters: {
      stages: [MAIN],
    },
    matchUpFilters: {
      matchUpTypes: [TEAM],
      roundNumbers: [1],
    },
  }).matchUps;
  expect(firstRoundDualMatchUps.map(({ score }) => score).filter(Boolean).length).toEqual(1);
});
