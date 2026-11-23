import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { includesMatchUpEventType } from '@Helpers/matchUpEventTypes/includesMatchUpEventType';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { checkDrawFormatCompatibility } from '@Validators/tiedFormatCompatibility';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpId } from '@Functions/global/extractors';
import { applyMatchUpFormat } from './applyMatchUpFormat';

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
  const structureIds: string[] = params.structureIds ?? (structureId ? [structureId] : []);
  const eventIds = params.eventIds ?? (eventId ? [eventId] : []);
  const drawIds = params.drawIds ?? (drawId ? [drawId] : []);

  if ((structureId || structureIds?.length) && !drawDefinition) {
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      stack,
    });
  }

  const compatibility = checkSelectedDrawFormats(params, { structureIds, eventIds, drawIds });
  if (compatibility.error) return compatibility;

  if (drawId && matchUpId && drawDefinition) {
    const result = applyMatchUpFormat({
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

  const processStructures = (targetDrawDefinition: DrawDefinition, targetEvent: Event) => {
    const result = applyFormatToStructures({
      drawDefinition: targetDrawDefinition,
      tournamentRecord,
      stageSequences,
      scheduledDates,
      matchUpFormat,
      structureIds,
      stack,
      force,
      event: targetEvent,
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
    scheduledDates,
    eventIds,
    drawIds,
    stages,
    force,
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
  scheduledDates,
  eventIds,
  drawIds,
  stages,
  force,
}: {
  processStructures: (drawDefinition: DrawDefinition, event: Event) => ReturnType<typeof applyFormatToStructures>;
  tournamentRecord?: Tournament;
  stageSequences?: number[];
  scheduledDates?: string[];
  structureIds: string[];
  matchUpFormat: string;
  eventType?: string;
  eventIds: string[];
  drawIds: string[];
  stages?: string[];
  force?: boolean;
}) {
  let count = 0;
  for (const evt of tournamentRecord?.events ?? []) {
    if (
      (eventIds?.length && !eventIds.includes(evt.eventId)) ||
      (eventType && eventType !== evt.eventType) ||
      eventType === TEAM
    ) {
      continue;
    }

    const scoped = Array.isArray(stageSequences) || Array.isArray(stages) || structureIds?.length || drawIds?.length;
    if (scoped || force || scheduledDates) {
      for (const dd of evt.drawDefinitions ?? []) {
        if (drawIds?.length && !drawIds.includes(dd.drawId)) continue;
        const result = processStructures(dd, evt);
        count += result.modificationsCount;
        if (result.modificationsCount) {
          modifyDrawNotice({
            tournamentId: tournamentRecord?.tournamentId,
            structureIds: result.modifiedStructureIds,
            drawDefinition: dd,
            eventId: evt.eventId,
          });
        }
      }
    }
    if (!scoped && evt.matchUpFormat !== matchUpFormat) {
      evt.matchUpFormat = matchUpFormat;
      count += 1;
      // event.matchUpFormat is a first-class event attribute — cover the change.
      modifyEventNotice({ tournamentId: tournamentRecord?.tournamentId, event: evt });
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

  for (const structure of drawDefinition.structures ?? []) {
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
      (scheduledDates?.length
        ? getAllStructureMatchUps({
            matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
            contextFilters: { scheduledDates },
            afterRecoveryTimes: false,
            inContext: true,
            structure,
          }).matchUps
        : []) ?? [];

    if (matchUps?.length) {
      const matchUpIdsToModify = new Set((scheduledDates ? inContextMatchUps : matchUps).map(getMatchUpId));
      const targetFormat = scheduledDates?.length ? matchUpFormat : undefined;

      for (const matchUp of matchUps) {
        if (matchUpIdsToModify.has(matchUp.matchUpId) && matchUp.matchUpFormat !== targetFormat) {
          matchUp.matchUpFormat = targetFormat;
          modificationsCount += 1;

          modifyMatchUpNotice({
            tournamentId: tournamentRecord?.tournamentId,
            eventId: event?.eventId,
            event,
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

function checkSelectedDrawFormats(
  params: SetMatchUpStatusArgs,
  selectors: { structureIds: string[]; eventIds: string[]; drawIds: string[] },
): ReturnType<typeof checkDrawFormatCompatibility> {
  const { tournamentRecord, eventType, stages, stageSequences, matchUpFormat, matchUpId, force } = params;
  const { structureIds, eventIds, drawIds } = selectors;
  // Validate every selected draw before bulk operations can mutate any of them.
  for (const evt of tournamentRecord?.events ?? []) {
    if ((eventIds.length && !eventIds.includes(evt.eventId)) || (eventType && evt.eventType !== eventType)) continue;
    for (const dd of evt.drawDefinitions ?? []) {
      if (drawIds.length && !drawIds.includes(dd.drawId)) continue;
      const selectedStructures = dd.structures
        ?.filter(
          (structure) =>
            (!stages || stages.includes(structure.stage!)) &&
            (!stageSequences || stageSequences.includes(structure.stageSequence!)) &&
            (!structureIds.length || structureIds.includes(structure.structureId)),
        )
        .map((structure) => structure.structureId);
      const writesDrawFormat =
        !structureIds.length ||
        !dd.structures?.some(
          (structure) =>
            selectedStructures?.includes(structure.structureId) && structure.matchUpFormat !== matchUpFormat,
        );
      const check = checkDrawFormatCompatibility({
        drawDefinition: dd,
        matchUpFormat,
        structureIds: writesDrawFormat ? undefined : selectedStructures,
        matchUpId: writesDrawFormat ? undefined : matchUpId,
        event: evt,
        force,
      });
      if (check.error) return check;
    }
  }

  return {};
}
