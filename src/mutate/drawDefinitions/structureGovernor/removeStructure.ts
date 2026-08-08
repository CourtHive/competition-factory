import { deleteMatchUpsNotice, modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpIds } from '@Functions/global/extractors';
import { resequenceStructures } from './resequenceStructures';
import { findStructure } from '@Acquire/findStructure';
import { xa } from '@Tools/extractAttributes';

// constants and types
import { CANNOT_REMOVE_MAIN_STRUCTURE, SCORES_PRESENT, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type RemoveStructureArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structureId: string;
  force?: boolean;
  event: Event;
};

export function removeStructure(params: RemoveStructureArgs) {
  const { tournamentRecord, drawDefinition, structureId, event } = params;
  const checkParams = checkRequiredParameters(params, [{ drawDefinition: true, structureId: true }]);
  if (checkParams.error) return checkParams;

  const structures = drawDefinition.structures ?? [];
  const structure = structures.find((structure) => structure.structureId === structureId);
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const mainStageSequence1 = structures.find(({ stage, stageSequence }) => stage === MAIN && stageSequence === 1);
  const isMainStageSequence1 = structureId === mainStageSequence1?.structureId;
  const qualifyingStructureIds = structures.filter(({ stage }) => stage === QUALIFYING).map(xa('structureId'));
  if (isMainStageSequence1 && !qualifyingStructureIds.length) return { error: CANNOT_REMOVE_MAIN_STRUCTURE };
  const isQualifyingStructure = qualifyingStructureIds.includes(structureId);

  const policyResult = policyCheck({ isQualifyingStructure, structure, ...params });
  if (policyResult?.error) return policyResult;

  const { structureIdsToRemove, relatedStructureIdsMap } = getIdsToRemove({
    qualifyingStructureIds,
    isQualifyingStructure,
    isMainStageSequence1,
    mainStageSequence1,
    drawDefinition,
    structureId,
  });

  const { removedMatchUpIds, removedStructureIds } = removeMatchUpsAndStructures({
    relatedStructureIdsMap,
    qualifyingStructureIds,
    isMainStageSequence1,
    mainStageSequence1,
    drawDefinition,
    structureIdsToRemove,
    structureId,
  });

  const { modifiedMatchUps } = removeReferencesToRemovedMatchUps({ removedMatchUpIds, drawDefinition });

  // if this is MAIN stageSequence: 1 there must be qualifying, return to empty state
  if (isMainStageSequence1) {
    const mainStageSequence1MatchUpIds = (mainStageSequence1.matchUps ?? [])?.map(xa('matchUpId'));
    removedMatchUpIds.push(...mainStageSequence1MatchUpIds);

    mainStageSequence1.positionAssignments = [];
    mainStageSequence1.seedAssignments = [];
    mainStageSequence1.matchUps = [];
    if (mainStageSequence1.extensions) {
      mainStageSequence1.extensions = [];
    }
  }

  if (isQualifyingStructure) resequenceStructures({ drawDefinition });

  deleteMatchUpsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    matchUpIds: removedMatchUpIds,
    action: 'removeStructure',
    eventId: event?.eventId,
    drawDefinition,
  });
  modifyDrawNotice({ drawDefinition, eventId: event?.eventId });

  // Surviving matchUps whose winner/loser progression edge pointed into the removed
  // structure were rewired above; each needs its own MODIFY_MATCHUP. The MODIFY_DRAW_DEFINITION
  // dispatched a line above says the draw changed but names no matchUp, so a consumer would
  // have to re-derive the whole draw to find them — and `winnerMatchUpId`/`loserMatchUpId` are
  // projected read-model columns, so a missed edge is a silently stale row, not a cosmetic gap.
  // `drawDefinition` is deliberately NOT passed: modifyMatchUpNotice would then emit a
  // redundant draw notice per matchUp on top of the single one above.
  for (const matchUp of modifiedMatchUps) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: ['removeStructure'],
      eventId: event?.eventId,
      matchUp,
    });
  }

  return { ...SUCCESS, removedMatchUpIds, removedStructureIds };
}

function policyCheck({
  isQualifyingStructure,
  tournamentRecord,
  drawDefinition,
  structureId,
  structure,
  event,
  force,
}: RemoveStructureArgs & { structure: Structure; isQualifyingStructure: boolean }) {
  const structureIdsToFilter: string[] = [structureId];

  if (isQualifyingStructure) {
    // if structure being rmoved is qualifying structure, ensure no source structures have scored matchUps
    const getSourceLink = (structureId) =>
      drawDefinition.links?.find((link) => link.target.structureId === structureId);
    let sourceStructureId = getSourceLink(structureId)?.source.structureId;
    while (sourceStructureId) {
      structureIdsToFilter.push(sourceStructureId);
      sourceStructureId = getSourceLink(sourceStructureId)?.source.structureId;
    }
  }

  const relevantMatchUps = getAllDrawMatchUps({
    matchUpFilters: { structureIds: structureIdsToFilter },
    drawDefinition,
  }).matchUps;

  const scoresPresent = relevantMatchUps?.some(({ score }) => checkScoreHasValue({ score }));

  if (scoresPresent) {
    const appliedPolicies = getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      structure,
      event,
    })?.appliedPolicies;

    const allowDeletionWithScoresPresent =
      force ?? appliedPolicies?.[POLICY_TYPE_SCORING]?.allowDeletionWithScoresPresent?.structures;

    if (!allowDeletionWithScoresPresent) return { error: SCORES_PRESENT };
  }

  return { ...SUCCESS };
}

// Cleanup references to removed matchUps, returning the matchUps actually rewired so the
// caller can dispatch a notice per changed matchUp. Structures being removed are already
// spliced out of `drawDefinition` by this point, so nothing here is itself being deleted —
// no matchUp gets both a MODIFY and a DELETE.
function removeReferencesToRemovedMatchUps({ removedMatchUpIds, drawDefinition }): {
  modifiedMatchUps: HydratedMatchUp[];
} {
  const { matchUps } = getAllDrawMatchUps({ drawDefinition });
  const modifiedMatchUps: HydratedMatchUp[] = [];
  matchUps?.forEach((matchUp) => {
    let modified = false;
    if (matchUp.winnerMatchUpId && removedMatchUpIds.includes(matchUp.winnerMatchUpId)) {
      delete matchUp.winnerMatchUpId;
      modified = true;
    }
    if (matchUp.loserMatchUpId && removedMatchUpIds.includes(matchUp.loserMatchUpId)) {
      delete matchUp.loserMatchUpId;
      modified = true;
    }
    if (modified) modifiedMatchUps.push(matchUp);
  });
  return { modifiedMatchUps };
}

function getIdsToRemove({
  qualifyingStructureIds,
  isQualifyingStructure,
  isMainStageSequence1,
  mainStageSequence1,
  drawDefinition,
  structureId,
}) {
  const structures = drawDefinition.structures ?? [];
  const structureIds: string[] = structures.map(xa('structureId'));

  const getTargetedStructureIds = (structureId) =>
    drawDefinition.links
      ?.map(
        (link) =>
          link.source.structureId === structureId &&
          link.target.structureId !== mainStageSequence1?.structureId &&
          link.target.structureId,
      )
      .filter(Boolean) ?? [];

  const getQualifyingSourceStructureIds = (structureId) =>
    drawDefinition.links
      ?.map(
        (link) =>
          qualifyingStructureIds.includes(link.source.structureId) &&
          link.target.structureId === structureId &&
          link.source.structureId,
      )
      .filter(Boolean) ?? [];

  const relatedStructureIdsMap = new Map<string, string[]>();
  structureIds.forEach((id) =>
    relatedStructureIdsMap.set(
      id,
      isQualifyingStructure
        ? (getQualifyingSourceStructureIds(id) as string[])
        : (getTargetedStructureIds(id) as string[]),
    ),
  );

  const structureIdsToRemove = isMainStageSequence1 ? relatedStructureIdsMap.get(structureId) : [structureId];
  return { structureIdsToRemove, relatedStructureIdsMap };
}

function removeMatchUpsAndStructures({
  relatedStructureIdsMap,
  qualifyingStructureIds,
  isMainStageSequence1,
  mainStageSequence1,
  drawDefinition,
  structureIdsToRemove,
  structureId,
}) {
  const removedStructureIds: string[] = [];
  const removedMatchUpIds: string[] = [];

  while (structureIdsToRemove?.length) {
    const idBeingRemoved = structureIdsToRemove.pop();
    removedMatchUpIds.push(...getRemovedMatchUpIds({ idBeingRemoved, drawDefinition }));

    const result = pruneLinksAndStructures({
      qualifyingStructureIds,
      isMainStageSequence1,
      idBeingRemoved,
      drawDefinition,
      structureId,
    });
    removedStructureIds.push(...result.removedStructureIds);

    const targetedStructureIds = getTargetedStructureIds({
      relatedStructureIdsMap,
      mainStageSequence1,
      idBeingRemoved,
      structureId,
    });

    if (targetedStructureIds?.length) structureIdsToRemove.push(...targetedStructureIds);
  }

  return { removedMatchUpIds, removedStructureIds };
}

function getTargetedStructureIds({ idBeingRemoved, relatedStructureIdsMap, mainStageSequence1, structureId }) {
  return (
    idBeingRemoved &&
    relatedStructureIdsMap.get(idBeingRemoved)?.filter(
      (id: string) =>
        // IMPORTANT: only delete MAIN stageSequence: 1 if specified to protect against DOUBLE_ELIMINATION scenario
        id !== mainStageSequence1?.structureId || structureId === mainStageSequence1.structureId,
    )
  );
}

function pruneLinksAndStructures({
  qualifyingStructureIds,
  isMainStageSequence1,
  idBeingRemoved,
  drawDefinition,
  structureId,
}) {
  const removedStructureIds: string[] = [];

  drawDefinition.links =
    drawDefinition.links?.filter(
      (link) => link.source.structureId !== idBeingRemoved && link.target.structureId !== idBeingRemoved,
    ) ?? [];

  if (
    !isMainStageSequence1 ||
    (isMainStageSequence1 && qualifyingStructureIds.length) ||
    idBeingRemoved !== structureId
  ) {
    drawDefinition.structures = (drawDefinition.structures ?? []).filter((structure) => {
      if (idBeingRemoved && idBeingRemoved === structure.structureId) removedStructureIds.push(idBeingRemoved);
      return structure.structureId !== idBeingRemoved;
    });
  }

  return { removedStructureIds };
}

function getRemovedMatchUpIds({ idBeingRemoved, drawDefinition }) {
  const { structure } = findStructure({
    structureId: idBeingRemoved,
    drawDefinition,
  });
  const matchUps: HydratedMatchUp[] = getAllStructureMatchUps({ structure }).matchUps;
  return getMatchUpIds(matchUps);
}
