import { modifyDrawEntriesNotice, modifyEventEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { entryPositionOf, entryStageOf, moveEntryToGroup } from './moveEntryToGroup';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_ENTRY_STATUS,
  PARTICIPANT_ENTRY_NOT_FOUND,
  PARTICIPANT_NOT_FOUND_IN_STAGE,
  PARTICIPANT_NOT_ENTERED_IN_STAGE,
  INVALID_VALUES,
  ErrorType,
} from '@Constants/errorConditionConstants';

// types
import type { DrawDefinition, Entry, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';

type PromotionScope = {
  drawDefinition?: DrawDefinition;
  tournamentRecord: Tournament;
  stage?: StageTypeUnion;
  stageSequence?: number;
  eventId?: string;
  drawId?: string;
  event: Event;
};
type PromoteAlternatesArgs = PromotionScope & { participantIds: string[] };

export function promoteAlternate(params: PromotionScope & { participantId?: string }) {
  const { participantId } = params;
  if (participantId && typeof participantId !== 'string') return { error: INVALID_VALUES, participantId };

  return promoteAlternates({
    ...params,
    participantIds: [participantId].filter(Boolean) as string[],
  });
}

/**
 * Promotes alternates to DIRECT_ACCEPTANCE, in the order of `participantIds`. With no `participantIds`
 * the event's alternate with the lowest `entryPosition` in the stage is promoted.
 *
 * Each promoted entry is placed after the stage's accepted entries (`max + 1` of their positions), and the
 * alternates behind it close up. The event's entries, the draw's entries and the entries of the matching
 * flights (the draw's flight, and every flight with no generated draw) are all checked before any is changed.
 */
export function promoteAlternates({
  tournamentRecord,
  drawDefinition,
  participantIds,
  stageSequence,
  stage = MAIN,
  eventId,
  drawId,
  event,
}: PromoteAlternatesArgs) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(participantIds)) return { error: INVALID_VALUES, participantIds };
  const stack = 'promoteAlternates';
  const tournamentId = tournamentRecord.tournamentId;
  const requestedIds = participantIds.filter((id, index) => participantIds.indexOf(id) === index);

  // ── plan every write before making any ──
  const eventPlan = planPromotion({ entries: event.entries, participantIds: requestedIds, stageSequence, stage });
  if (eventPlan.error) return eventPlan;

  // the event decides who is promoted; the draw and flights follow it rather than choosing their own alternate
  const promotedIds = eventPlan.promoted.map(({ participantId }) => participantId);

  let drawPlan: AcceptedPlan | undefined;
  let drawPromotionError: ErrorType | undefined;
  if (drawDefinition) {
    const plan = planPromotion({
      entries: drawDefinition.entries,
      participantIds: promotedIds,
      lenient: true,
      stageSequence,
      stage,
    });
    if (plan.error) {
      // with split draws an alternate may or may not appear in drawDefinition.entries: an event promotion
      // is not failed for want of the draw's; without an eventId nothing has been written and it is refused
      if (!eventId) return plan;
      drawPromotionError = plan.error;
    } else {
      drawPlan = plan as AcceptedPlan;
    }
  }

  const targetDrawId = drawDefinition?.drawId ?? drawId;
  const generatedDrawIds = new Set((event.drawDefinitions ?? []).map(({ drawId: id }) => id));
  const flights = (getFlightProfile({ event }).flightProfile?.flights ?? []).filter(
    (flight) => flight.drawId === targetDrawId || !generatedDrawIds.has(flight.drawId),
  );
  const flightPlans = flights
    .map((flight) => planPromotion({ entries: flight.drawEntries, participantIds: promotedIds, lenient: true, stage }))
    .filter((plan): plan is AcceptedPlan => !plan.error && plan.promoted.length > 0);

  // ── write ──
  applyPromotion({ entries: event.entries ?? [], promoted: eventPlan.promoted });
  modifyEventEntriesNotice({ tournamentId, event });

  for (const plan of flightPlans) applyPromotion(plan);
  if (flightPlans.length) modifyEventNotice({ tournamentId, event });

  if (drawDefinition && drawPlan) {
    applyPromotion({ entries: drawDefinition.entries ?? [], promoted: drawPlan.promoted });
    modifyDrawEntriesNotice({ eventId: event.eventId, drawDefinition, tournamentId });
  }

  if (drawPromotionError) {
    return decorateResult({
      context: { drawPromotionError, drawId: drawDefinition?.drawId },
      result: { ...SUCCESS },
      stack,
    });
  }

  return { ...SUCCESS };
}

type AcceptedPlan = { promoted: Entry[]; entries: Entry[]; error?: undefined };
type RefusedPlan = { error: ErrorType; [key: string]: unknown };
type PromotionPlan = AcceptedPlan | RefusedPlan;

function planPromotion({
  participantIds,
  stageSequence,
  lenient,
  entries,
  stage,
}: {
  participantIds: string[];
  stageSequence?: number;
  entries?: Entry[];
  lenient?: boolean;
  stage: string;
}): PromotionPlan {
  const elementEntries = entries ?? [];

  let promoted: Entry[];
  if (participantIds.length) {
    const found = participantIds
      .map((participantId) => elementEntries.find((entry) => entry.participantId === participantId))
      .filter(Boolean) as Entry[];
    // the event must hold every requested entry; a draw or flight promotes the ones it holds
    const missing = participantIds.filter((id) => !found.some(({ participantId }) => participantId === id));
    if (!found.length || (missing.length && !lenient)) return { error: PARTICIPANT_ENTRY_NOT_FOUND, missing };
    promoted = lenient
      ? found.filter((entry) => entry.entryStatus === ALTERNATE && entryStageOf(entry) === stage)
      : found;
    if (!promoted.length) return { error: PARTICIPANT_ENTRY_NOT_FOUND };
  } else {
    const nextAlternate = getNextAlternate({ entries: elementEntries, stageSequence, stage });
    if (!nextAlternate) return { error: PARTICIPANT_ENTRY_NOT_FOUND };
    promoted = [nextAlternate];
  }

  const invalidEntryStatus = promoted.filter(({ entryStatus }) => entryStatus !== ALTERNATE);
  if (invalidEntryStatus.length) return { error: INVALID_ENTRY_STATUS, invalidEntryStatus };

  const invalidStage = promoted.filter(({ entryStage }) => entryStage && entryStage !== stage);
  if (invalidStage.length) return { error: PARTICIPANT_NOT_ENTERED_IN_STAGE, invalidStage };

  const invalidStageSequence = stageSequence
    ? promoted.filter((entry) => entry.entryStageSequence !== stageSequence)
    : [];
  if (invalidStageSequence.length) return { error: PARTICIPANT_NOT_FOUND_IN_STAGE, invalidStageSequence };

  return { promoted, entries: elementEntries };
}

// the stage's alternate with the lowest entryPosition; with no positioned alternate, the first one entered
function getNextAlternate({
  entries,
  stageSequence,
  stage,
}: {
  entries: Entry[];
  stageSequence?: number;
  stage: string;
}) {
  const alternates = entries.filter(
    (entry) =>
      entry.entryStatus === ALTERNATE &&
      entryStageOf(entry) === stage &&
      (!stageSequence || entry.entryStageSequence === stageSequence),
  );
  const positioned = alternates.filter((entry) => entryPositionOf(entry) !== undefined);
  if (!positioned.length) return alternates[0];
  return positioned.reduce((lowest, entry) =>
    (entryPositionOf(entry) as number) < (entryPositionOf(lowest) as number) ? entry : lowest,
  );
}

// each promoted entry leaves the alternates, which close up behind it, and follows the stage's accepted entries
function applyPromotion({ entries, promoted }: { entries: Entry[]; promoted: Entry[] }) {
  for (const entry of promoted) moveEntryToGroup({ entries, entry, entryStatus: DIRECT_ACCEPTANCE });
}
