import { requireParams } from '@Helpers/parameters/requireParams';
import { removeScaleValues } from './removeScaleValues';

// constants
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { SEEDING } from '@Constants/scaleConstants';
import type { DrawDefinition, EntryStatusUnion, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';

type RemoveSeedingArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  entryStatuses?: EntryStatusUnion[];
  scaleName?: string;
  drawId?: string;
  event?: Event;
  stage?: StageTypeUnion;
};
// prettier-ignore
export function removeSeeding({ tournamentRecord, drawDefinition, entryStatuses, scaleName, drawId, event, stage }: RemoveSeedingArgs) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  scaleName = scaleName || event!.category?.categoryName || event!.category?.ageCategoryCode;

  const scaleAttributes = {
    eventType: event!.eventType,
    scaleType: SEEDING,
    scaleName,
  };

  return removeScaleValues({
    tournamentRecord,
    scaleAttributes,
    drawDefinition,
    entryStatuses,
    drawId,
    event,
    stage,
  } as Parameters<typeof removeScaleValues>[0]);
}
