import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  ADD_NICKNAME,
  ADD_PENALTY,
  ASSIGN_BYE,
  REMOVE_ASSIGNMENT,
  REMOVE_SEED,
  SEED_VALUE,
  SWAP_PARTICIPANTS,
  WITHDRAW_PARTICIPANT,
} from '@Constants/positionActionConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

test('A DOUBLE_WALKOVER in FMLC does not restrict positionActions', () => {
  const drawProfiles = [{ drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = getTarget({
    matchUps,
    roundNumber: 1,
    roundPosition: 1,
  });

  let result = tournamentEngine.positionActions({
    structureId: targetMatchUp.structureId,
    drawPosition: 3,
    drawId,
  });

  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.validActions.map(({ type }) => type)).toEqual([
    REMOVE_ASSIGNMENT,
    WITHDRAW_PARTICIPANT,
    ASSIGN_BYE,
    SEED_VALUE,
    REMOVE_SEED,
    ADD_PENALTY,
    ADD_NICKNAME,
    SWAP_PARTICIPANTS,
  ]);

  // Enter DOUBLE_WALKOVER in R1P1
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });

  expect(result.success).toEqual(true);

  result = tournamentEngine.positionActions({
    structureId: targetMatchUp.structureId,
    drawPosition: 3,
    drawId,
  });

  expect(result.isActiveDrawPosition).toEqual(false);
  expect(result.validActions.map(({ type }) => type)).toEqual([
    REMOVE_ASSIGNMENT,
    WITHDRAW_PARTICIPANT,
    ASSIGN_BYE,
    ADD_PENALTY,
    ADD_NICKNAME,
    SWAP_PARTICIPANTS,
  ]);

  // even when there are activeDrawPositions, overrides can enable specific actions which are otherwise disabled
  result = tournamentEngine.positionActions({
    policyDefinitions: {
      [POLICY_TYPE_POSITION_ACTIONS]: {
        activePositionOverrides: [SEED_VALUE, REMOVE_SEED],
      },
    },
    structureId: targetMatchUp.structureId,
    drawPosition: 3,
    drawId,
  });
  expect(result.validActions.map(({ type }) => type)).toEqual([
    REMOVE_ASSIGNMENT,
    WITHDRAW_PARTICIPANT,
    ASSIGN_BYE,
    SEED_VALUE,
    REMOVE_SEED,
    ADD_PENALTY,
    ADD_NICKNAME,
    SWAP_PARTICIPANTS,
  ]);
});
