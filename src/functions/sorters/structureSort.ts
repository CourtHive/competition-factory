import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { Structure } from '@Types/tournamentTypes';
import {
  aggregateOrder,
  finishOrder,
  stageOrder,
  AGGREGATE_EVENT_STRUCTURES,
  FINISHING_POSITIONS,
  MAIN,
} from '@Constants/drawDefinitionConstants';

export function structureSort(a: Structure | undefined, b: Structure | undefined, config?): number {
  const getRoundTarget = (element) => firstClassOrExtension({ element, attribute: 'roundTarget', name: ROUND_TARGET });

  const completed = config?.deprioritizeCompleted;
  const aggregate = config?.mode === AGGREGATE_EVENT_STRUCTURES && aggregateOrder;
  const finish = config?.mode === FINISHING_POSITIONS && finishOrder;

  const orderProtocol = finish || aggregate || stageOrder;

  const isMain1 = (s) => s?.stage === MAIN && s?.stageSequence === 1;
  const protocolSequence = (s): number => (isMain1(s) ? -1 : orderProtocol[s?.stage]);

  const completedStructure = (s): number =>
    s?.matchUps.every(({ matchUpStatus }) => (completedMatchUpStatuses.includes(matchUpStatus) ? 1 : -1));

  return (
    (completed && completedStructure(a) - completedStructure(b)) ||
    (aggregate && protocolSequence(a) - protocolSequence(b)) ||
    ((a?.stage && orderProtocol[a.stage]) || 0) - ((b?.stage && orderProtocol[b.stage]) || 0) ||
    (getRoundTarget(a) || 0) - (getRoundTarget(b) || 0) ||
    (!finish &&
      !aggregate &&
      (b?.positionAssignments?.length ?? Infinity) - (a?.positionAssignments?.length ?? Infinity)) ||
    (a?.stageSequence ?? 0) - (b?.stageSequence ?? 0) ||
    (getMinFinishingPositionRange(a) || 0) - (getMinFinishingPositionRange(b) || 0)
  );
}

export function getMinFinishingPositionRange(structure): number {
  return (structure?.matchUps ?? []).reduce((rangeSum, matchUp) => {
    const sum = (matchUp.finishingPositionRange?.winner ?? []).reduce((a, b) => a + b, 0);
    return !rangeSum || sum < rangeSum ? sum : rangeSum;
  }, undefined);
}
