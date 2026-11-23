import { matchUpSort } from '@Functions/sorters/matchUpSort';
import tournamentEngine from '@Engines/syncEngine';
import { expect } from 'vitest';

// constants and types
import { ASSIGN_PARTICIPANT, REMOVE_ASSIGNMENT } from '@Constants/positionActionConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

export function getOrderedDrawPositionPairs(params?) {
  const matchUpFilters = { structureIds: [params?.structureId] };
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters,
  });
  const orderedPairs = matchUps
    .map(({ roundNumber, roundPosition, drawPositions }) => ({
      roundPosition,
      drawPositions,
      roundNumber,
    }))
    .sort(matchUpSort)
    .map(({ drawPositions }) => drawPositions?.sort((a, b) => a - b));

  const filteredOrderedPairs = orderedPairs?.map((pair) => pair?.filter(Boolean));
  return { filteredOrderedPairs, orderedPairs, matchUps };
}

export function getContextMatchUp({ matchUps, roundNumber, roundPosition, stage = MAIN, stageSequence = 1 }) {
  const matchUp = matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition &&
      matchUp.stage === stage &&
      matchUp.stageSequence === stageSequence,
  );
  return { matchUp };
}

export function assignDrawPosition({ drawId, structureId, drawPosition }) {
  let result = tournamentEngine.positionActions({
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isDrawPosition).toEqual(true);
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ASSIGN_PARTICIPANT)).toEqual(true);
  const option = result.validActions.find((action) => action.type === ASSIGN_PARTICIPANT);
  const { availableParticipantIds } = option;
  const payload = option.payload;
  const participantId = availableParticipantIds[0];
  Object.assign(payload, { participantId });
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);
  return result;
}

type RemoveAssignmentArgs = {
  policyDefinitions?: PolicyDefinitions;
  replaceWithBye?: boolean;
  drawPosition: number;
  structureId: string;
  drawId: string;
};

export function removeAssignment({
  policyDefinitions,
  replaceWithBye,
  drawPosition,
  structureId,
  drawId,
}: RemoveAssignmentArgs) {
  let result = tournamentEngine.positionActions({
    policyDefinitions,
    drawPosition,
    structureId,
    drawId,
  });
  expect(result.isDrawPosition).toEqual(true);
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(REMOVE_ASSIGNMENT)).toEqual(true);
  const option = result.validActions.find((action) => action.type === REMOVE_ASSIGNMENT);
  const payload = option.payload;
  Object.assign(payload, { replaceWithBye });
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);
  return result;
}

export function replaceWithBye(params) {
  const { policyDefinitions, drawPosition, structureId, drawId } = params;
  const { validActions } = tournamentEngine.positionActions({
    policyDefinitions,
    drawPosition,
    structureId,
    drawId,
  });
  const { method, payload } = validActions.find(({ type }) => type === BYE);
  const result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  return result;
}

export function replaceWithAlternate(params) {
  const { policyDefinitions, drawPosition, structureId, drawId } = params;
  const { validActions } = tournamentEngine.positionActions({
    policyDefinitions,
    drawPosition,
    structureId,
    drawId,
  });
  let result = validActions.find(({ type }) => type === ALTERNATE);
  const { method, payload, availableAlternatesParticipantIds } = result;
  const alternateParticipantId = availableAlternatesParticipantIds[0];
  Object.assign(payload, { alternateParticipantId });
  result = tournamentEngine[method](payload);
  expect(result.success).toEqual(true);
  return result;
}
