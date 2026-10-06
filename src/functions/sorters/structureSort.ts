import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { MatchUp, Structure } from '@Types/tournamentTypes';
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

  // a round robin is a CONTAINER: its matchUps and positionAssignments live on its groups
  const structureMatchUps = (s?: Structure): MatchUp[] => {
    const groups = structuresOf(s);
    return groups ? groups.flatMap((group) => matchUpsOf(group) ?? []) : (matchUpsOf(s) ?? []);
  };
  const assignmentsCount = (s?: Structure): number | undefined => {
    const groups = structuresOf(s);
    if (!groups) return positionAssignmentsOf(s)?.length;
    return groups.flatMap((group) => positionAssignmentsOf(group) ?? []).length;
  };

  const isCompleted = ({ matchUpStatus }: MatchUp) =>
    !!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus);
  const completedStructure = (s?: Structure): number => (structureMatchUps(s).every(isCompleted) ? 1 : 0);

  return (
    (completed && completedStructure(a) - completedStructure(b)) ||
    (aggregate && protocolSequence(a) - protocolSequence(b)) ||
    ((a?.stage && orderProtocol[a.stage]) || 0) - ((b?.stage && orderProtocol[b.stage]) || 0) ||
    (getRoundTarget(a) || 0) - (getRoundTarget(b) || 0) ||
    (!finish && !aggregate && (assignmentsCount(b) ?? Infinity) - (assignmentsCount(a) ?? Infinity)) ||
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
