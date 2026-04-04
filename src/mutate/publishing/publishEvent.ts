import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifyEventPublishStatus } from '../events/modifyEventPublishStatus';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice, getTopics } from '@Global/state/globalState';
import { getEventData } from '@Query/event/getEventData';

// constants and types
import { DRAW_DEFINITION_NOT_FOUND, INVALID_EMBARGO, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { EVENT, OBJECT, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { Event, Tournament } from '@Types/tournamentTypes';
import { PUBLISH_EVENT } from '@Constants/topicConstants';
import { PUBLIC } from '@Constants/timeItemConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { isValidEmbargoDate } from '@Tools/dateTime';

export type ScheduledRoundDetail = {
  published?: boolean;
  embargo?: string;
};

export type PublishingDetail = {
  scheduledRounds?: { [roundNumber: number]: ScheduledRoundDetail };
  roundLimit?: number; // only applicable to structureDetails
  published?: boolean;
  embargo?: string;
};

export type DrawPublishingDetails = {
  structureDetails?: { [key: string]: PublishingDetail }; // if no keys, all published
  stageDetails?: { [key: string]: PublishingDetail }; // if no keys, all published; stage embargo supercedes structure embargo
  publishingDetail: PublishingDetail; // draw embargo supercedes structure/stage embargo
  structureIdsToRemove?: string[];
  structureIdsToAdd?: string[];
  stagesToRemove?: string[];
  stagesToAdd?: string[];
};

type PublishEventType = {
  includePositionAssignments?: boolean; // include positionAssignments in eventData
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  returnEventData?: boolean;
  eventDataParams?: any;
  drawIds?: string[];
  status?: string;
  event?: Event;

  drawDetails?: { [key: string]: DrawPublishingDetails }; // if no keys, all published

  drawIdsToRemove?: string[];
  drawIdsToAdd?: string[];
};

export function publishEvent(params: PublishEventType): ResultType & { eventData?: any } {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true, [EVENT]: true },
    { eventDataParams: false, [OF_TYPE]: OBJECT },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const {
    includePositionAssignments,
    removePriorValues,
    tournamentRecord,
    status = PUBLIC,
    event,

    drawIdsToRemove,
    drawIdsToAdd,
  } = params;

  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord, event });
  const policyDefinitions = {
    ...appliedPolicies,
    ...params.policyDefinitions,
  };

  const eventDrawIds = event?.drawDefinitions?.map(({ drawId }) => drawId) ?? [];

  const keyedDrawIds = params.drawDetails ? Object.keys(params.drawDetails) : [];
  const specifiedDrawIds = keyedDrawIds.length ? [] : params.drawIds;

  const drawIdsToValidate = (drawIdsToAdd ?? []).concat(
    ...(drawIdsToRemove ?? []),
    ...(specifiedDrawIds ?? []),
    ...keyedDrawIds,
  );

  const drawIdValidation = validateDrawIds({ drawIdsToValidate, eventDrawIds });
  if (drawIdValidation?.error) return drawIdValidation;

  const embargoValidation = validateEmbargoValues(params.drawDetails);
  if (embargoValidation?.error) return embargoValidation;

  const pubStatus = getEventPublishStatus({ event, status });

  const drawDetails = buildExistingDrawDetails({ pubStatus, eventDrawIds });

  applyDrawIdPublishState({ drawDetails, eventDrawIds, drawIdsToValidate, drawIdsToRemove, drawIdsToAdd, specifiedDrawIds });

  for (const drawId of eventDrawIds) {
    if (params.drawDetails?.[drawId]) {
      const result = mergeDrawDetail({ drawDetails, drawId, newDetail: params.drawDetails[drawId], event });
      if (result?.error) return result;
    }
  }

  modifyEventPublishStatus({
    statusObject: { drawDetails },
    removePriorValues,
    status,
    event,
  });

  const { topics } = getTopics();
  const notify = topics.includes(PUBLISH_EVENT);

  const eventData =
    notify || params.returnEventData
      ? getEventData({
          includePositionAssignments,
          ...params.eventDataParams,
          usePublishState: true,
          tournamentRecord,
          policyDefinitions,
          event,
        })?.eventData
      : undefined;

  if (notify)
    addNotice({
      payload: { eventData, tournamentId: tournamentRecord.tournamentId },
      topic: PUBLISH_EVENT,
    });

  return { ...SUCCESS, eventData };
}

function validateDrawIds({ drawIdsToValidate, eventDrawIds }) {
  const invalidDrawIds = drawIdsToValidate.filter((drawId) => !eventDrawIds.includes(drawId));
  if (invalidDrawIds.length) {
    return decorateResult({
      result: { error: DRAW_DEFINITION_NOT_FOUND },
      context: { invalidDrawIds },
    });
  }
  return undefined;
}

function hasInvalidEmbargo(embargo?: string): boolean {
  return !!embargo && !isValidEmbargoDate(embargo);
}

function validateEmbargoValues(drawDetailsParam) {
  if (!drawDetailsParam) return undefined;

  for (const drawId of Object.keys(drawDetailsParam)) {
    const detail = drawDetailsParam[drawId];
    if (hasInvalidEmbargo(detail.publishingDetail?.embargo)) {
      return { error: INVALID_EMBARGO };
    }

    const stageError = validateDetailEmbargoes(detail.stageDetails);
    if (stageError) return stageError;

    const structureError = validateStructureDetailEmbargoes(detail.structureDetails);
    if (structureError) return structureError;
  }
  return undefined;
}

function validateDetailEmbargoes(details) {
  if (!details) return undefined;
  for (const key of Object.keys(details)) {
    if (hasInvalidEmbargo(details[key].embargo)) {
      return { error: INVALID_EMBARGO };
    }
  }
  return undefined;
}

function validateStructureDetailEmbargoes(structureDetails) {
  if (!structureDetails) return undefined;
  for (const id of Object.keys(structureDetails)) {
    const sd = structureDetails[id];
    if (hasInvalidEmbargo(sd.embargo)) {
      return { error: INVALID_EMBARGO };
    }
    if (sd.scheduledRounds) {
      const roundError = validateDetailEmbargoes(sd.scheduledRounds);
      if (roundError) return roundError;
    }
  }
  return undefined;
}

function buildExistingDrawDetails({ pubStatus, eventDrawIds }) {
  return Object.keys(pubStatus?.drawDetails ?? {})
    .filter((drawId) => eventDrawIds.includes(drawId))
    .reduce((details: any, drawId) => {
      details[drawId] = pubStatus.drawDetails[drawId];
      return details;
    }, {});
}

function applyDrawIdPublishState({ drawDetails, eventDrawIds, drawIdsToValidate, drawIdsToRemove, drawIdsToAdd, specifiedDrawIds }) {
  for (const drawId of eventDrawIds) {
    if (!drawIdsToValidate.length || drawIdsToValidate.includes(drawId)) {
      if (drawIdsToRemove?.includes(drawId) || (specifiedDrawIds?.length && !specifiedDrawIds.includes(drawId))) {
        drawDetails[drawId] = {
          ...drawDetails[drawId],
          publishingDetail: { published: false },
        };
      } else if (drawIdsToAdd?.includes(drawId) || specifiedDrawIds?.includes(drawId) || !specifiedDrawIds?.length) {
        drawDetails[drawId] = {
          ...drawDetails[drawId],
          publishingDetail: { published: true },
        };
      }
    }
  }
}

function mergeDrawDetail({ drawDetails, drawId, newDetail, event }) {
  let structureDetails = newDetail.structureDetails ?? drawDetails[drawId].structureDetails;
  const stageDetails = newDetail.stageDetails ?? drawDetails[drawId].stageDetails ?? {};

  const {
    structureIdsToRemove = [],
    structureIdsToAdd = [],
    publishingDetail = {},
    stagesToRemove = [],
    stagesToAdd = [],
  } = newDetail;

  if (structureIdsToAdd || stagesToAdd) publishingDetail.published = true;

  drawDetails[drawId] = {
    publishingDetail,
    structureDetails,
    stageDetails,
  };

  if (structureIdsToAdd.length || structureIdsToRemove.length) {
    const result = applyStructureChanges({ drawDetails, drawId, structureIdsToAdd, structureIdsToRemove, structureDetails, event });
    if (result?.error) return result;
  }

  const drawStages = (
    event?.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId)?.structures ?? []
  ).map(({ stage }) => stage as string);

  applyStageChanges({ stageDetails, stagesToAdd, stagesToRemove, drawStages });

  if (stagesToAdd.length || stagesToRemove.length) {
    drawDetails[drawId].stageDetails = stageDetails;
  }

  return undefined;
}

function applyStructureChanges({ drawDetails, drawId, structureIdsToAdd, structureIdsToRemove, structureDetails, event }) {
  const drawStructureIds = (
    event?.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId)?.structures ?? []
  ).map(({ structureId }) => structureId);
  const structureIdsToValidate = (structureIdsToAdd ?? []).concat(structureIdsToRemove ?? []);
  const invalidStructureIds = structureIdsToValidate.filter(
    (structureId) => !drawStructureIds.includes(structureId),
  );
  if (invalidStructureIds.length) {
    return decorateResult({
      result: { error: STRUCTURE_NOT_FOUND },
      context: { invalidStructureIds },
    });
  }

  structureDetails = structureDetails ?? {};
  for (const structureId of drawStructureIds) {
    if (structureIdsToRemove.includes(structureId)) {
      structureDetails[structureId] = { published: false };
    } else {
      structureDetails[structureId] = { published: true };
    }
  }

  drawDetails[drawId].structureDetails = structureDetails;
  return undefined;
}

function applyStageChanges({ stageDetails, stagesToAdd, stagesToRemove, drawStages }) {
  if (stagesToAdd.length) {
    for (const stage of stagesToAdd) {
      stageDetails[stage] = { published: true };
    }

    for (const stage of drawStages) {
      if (!stageDetails[stage]) {
        stageDetails[stage] = { published: false };
      }
    }
  }
  if (stagesToAdd.length || stagesToRemove.length) {
    for (const stage of stagesToRemove) {
      stageDetails[stage] = { published: false };
    }

    for (const stage of drawStages) {
      if (!stageDetails[stage]) {
        stageDetails[stage] = { published: true };
      }
    }
  }
}
