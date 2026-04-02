import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { setMatchUpMatchUpFormat } from './setMatchUpMatchUpFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpId } from '@Functions/global/extractors';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { INVALID, VALIDATE } from '@Constants/attributeConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  INVALID_EVENT_TYPE,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  NO_MODIFICATIONS_APPLIED,
  UNRECOGNIZED_MATCHUP_FORMAT,
} from '@Constants/errorConditionConstants';

// external use; set matchUpFormat for a events, draws, structures or matchUp

type SetMatchUpStatusArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  scheduledDates?: string[];
  stageSequences?: number[];
  structureIds?: string[];
  matchUpFormat: string;
  structureId?: string;
  eventIds?: string[];
  eventType?: string;
  matchUpId?: string;
  drawIds?: string[];
  stages?: string[];
  eventId?: string;
  drawId?: string;
  force?: boolean;
  event?: Event;
};

export function setMatchUpFormat(params: SetMatchUpStatusArgs) {
  const stack = 'setMatchUpFormat';

  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true },
    {
      [VALIDATE]: (value) => isValidMatchUpFormat({ matchUpFormat: value }),
      [INVALID]: UNRECOGNIZED_MATCHUP_FORMAT,
      matchUpFormat: true,
    },
  ]);
  if (paramsCheck.error) return decorateResult({ result: paramsCheck, stack });

  const {
    tournamentRecord,
    drawDefinition,
    scheduledDates,
    stageSequences,
    matchUpFormat,
    structureId,
    eventType, // only SINGLES or DOUBLES
    matchUpId,
    eventId,
    stages,
    drawId,
    event,
    force, // strip matchUpFormat from scoped matchUps which have not been scored
  } = params;

  if (scheduledDates && !Array.isArray(scheduledDates))
    return decorateResult({
      result: { error: INVALID_VALUES, scheduledDates },
      stack,
    });
  if (eventType && !includesMatchUpEventType([SINGLES, DOUBLES], eventType))
    return decorateResult({ result: { error: INVALID_EVENT_TYPE }, stack });

  let modificationsCount = 0;
  const structureIds: string[] = params.structureIds || (structureId && [structureId].filter(Boolean)) || [];
  const eventIds = params.eventIds || (eventId && [eventId].filter(Boolean)) || [];
  const drawIds = params.drawIds || (drawId && [drawId].filter(Boolean)) || [];

  if ((structureId || structureIds?.length) && !drawDefinition) {
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });
  }

  if (drawId && matchUpId && drawDefinition) {
    const result = setMatchUpMatchUpFormat({
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      structureIds,
      structureId,
      matchUpId,
    });
    if (result.error) return result;
    modificationsCount += 1;
  }

  const processStructures = (targetDrawDefinition) => {
    const result = applyFormatToStructures({
      drawDefinition: targetDrawDefinition,
      tournamentRecord,
      stageSequences,
      scheduledDates,
      matchUpFormat,
      structureIds,
      stack,
      force,
      event,
      stages,
    });
    return result;
  };

  modificationsCount += applyFormatToEvents({
    tournamentRecord,
    processStructures,
    stageSequences,
    matchUpFormat,
    structureIds,
    eventType,
    eventIds,
    drawIds,
    stages,
  });

  if (!modificationsCount) return { ...SUCCESS, info: NO_MODIFICATIONS_APPLIED };

  return { ...SUCCESS, modificationsCount };
}

function applyFormatToEvents({
  tournamentRecord,
  processStructures,
  stageSequences,
  matchUpFormat,
  structureIds,
  eventType,
  eventIds,
  drawIds,
  stages,
}) {
  let count = 0;
  for (const evt of tournamentRecord?.events || []) {
    if (
      (eventIds?.length && !eventIds.includes(evt.eventId)) ||
      (eventType && eventType !== evt.eventType) ||
      eventType === TEAM
    ) {
      continue;
    }

    if (Array.isArray(stageSequences) || Array.isArray(stages) || structureIds?.length || drawIds?.length) {
      for (const dd of evt.drawDefinitions || []) {
        if (Array.isArray(drawIds) && !drawIds.includes(dd.drawId)) continue;
        const result = processStructures(dd);
        count += result.modificationsCount;
        modifyDrawNotice({ structureIds: result.modifiedStructureIds, drawDefinition: dd });
      }
    } else if (evt.matchUpFormat !== matchUpFormat) {
      evt.matchUpFormat = matchUpFormat;
      count += 1;
    }
  }
  return count;
}

function applyFormatToStructures({
  drawDefinition,
  tournamentRecord,
  stageSequences,
  scheduledDates,
  matchUpFormat,
  structureIds,
  stack,
  force,
  event,
  stages,
}) {
  const modifiedStructureIds: string[] = [];
  let modificationsCount = 0;

  for (const structure of drawDefinition.structures || []) {
    if (
      (Array.isArray(stages) && !stages.includes(structure.stage)) ||
      (Array.isArray(stageSequences) && !stageSequences.includes(structure.stageSequence)) ||
      (structureIds?.length && !structureIds.includes(structure.structureId))
    )
      continue;

    if (structureIds?.length && structure.matchUpFormat !== matchUpFormat) {
      structure.matchUpFormat = matchUpFormat;
      modifiedStructureIds.push(structure.structureId);
      modificationsCount += 1;
    }

    const matchUps: MatchUp[] =
      ((force || scheduledDates) &&
        getAllStructureMatchUps({
          matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
          structure,
        }).matchUps) ??
      [];

    const inContextMatchUps: HydratedMatchUp[] =
      (scheduledDates &&
        getAllStructureMatchUps({
          matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
          contextFilters: { scheduledDates },
          afterRecoveryTimes: false,
          inContext: true,
          structure,
        }).matchUps) ??
      [];

    if (matchUps?.length) {
      const matchUpIdsToModify = inContextMatchUps ? inContextMatchUps.map(getMatchUpId) : matchUps.map(getMatchUpId);

      for (const matchUp of matchUps) {
        if (matchUpIdsToModify.includes(matchUp.matchUpId)) {
          matchUp.matchUpFormat = scheduledDates?.length ? matchUpFormat : undefined;

          modifyMatchUpNotice({
            tournamentId: tournamentRecord?.tournamentId,
            eventId: event?.eventId,
            context: stack,
            drawDefinition,
            matchUp,
          });
        }
      }
    }
  }

  if (!modifiedStructureIds.length && drawDefinition.matchUpFormat !== matchUpFormat) {
    drawDefinition.matchUpFormat = matchUpFormat;
    modificationsCount += 1;
  }

  return { modifiedStructureIds, modificationsCount };
}
