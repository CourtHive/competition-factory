import { DrawDefinition, Event, Structure } from '@Types/tournamentTypes';

/**
 * Walk a structure tree collecting declared matchUpFormat codes.
 *
 * Round-robin item structures nest under `structure.structures`, so this
 * recurses rather than reading one level.
 */
function collectStructureMatchUpFormats(structures: Structure[] | undefined, collected: Set<string>): void {
  for (const structure of structures ?? []) {
    if (structure?.matchUpFormat) collected.add(structure.matchUpFormat);
    collectStructureMatchUpFormats(structure?.structures, collected);
  }
}

/**
 * Every distinct matchUpFormat code declared anywhere in an event — on the
 * event itself, on any of its drawDefinitions, or on any of their structures
 * (depth-first, in encounter order).
 *
 * This is a **survey, not a resolution**. `competitionFormat` documents the
 * effective-format hierarchy as `matchUp > structure > drawDefinition > event`,
 * where specificity flows downward; nothing here implies precedence, and a
 * caller must not read the first entry as "the" format for the event. It exists
 * because a scoring code identifies the SPORT being played, and the sport is a
 * property of the whole event however deep the code happens to be stored.
 *
 * In practice codes are usually declared at drawDefinition level: a live
 * tournament surveyed while this was written declared nothing on the event and
 * `SET3-S:6/TB7` on its drawDefinition.
 */
export function getEventMatchUpFormats(event?: Event): string[] {
  const collected = new Set<string>();

  if (event?.matchUpFormat) collected.add(event.matchUpFormat);

  const drawDefinitions: DrawDefinition[] = event?.drawDefinitions ?? [];
  for (const drawDefinition of drawDefinitions) {
    if (drawDefinition?.matchUpFormat) collected.add(drawDefinition.matchUpFormat);
    collectStructureMatchUpFormats(drawDefinition?.structures, collected);
  }

  return [...collected];
}

export function extractEventInfo({ event }) {
  const {
    competitionFormat,
    surfaceCategory,
    onlineResources,
    matchUpFormat,
    discipline,
    eventLevel,
    eventName,
    eventType,
    startDate,
    category,
    ballType,
    eventId,
    endDate,
    gender,
    notes,
  } = event;

  const entriesCount = event.entries?.length ?? 0;

  // Distinct codes from anywhere in the event. Omitted when empty so events
  // that declare no format keep their existing payload shape, matching the
  // undefined-valued fields alongside.
  const matchUpFormats = getEventMatchUpFormats(event);

  const eventInfo = {
    drawDefinitionCount: event.drawDefinitions?.length,
    matchUpFormats: matchUpFormats.length ? matchUpFormats : undefined,
    competitionFormat,
    entriesCount,
    surfaceCategory,
    onlineResources,
    matchUpFormat,
    discipline,
    eventLevel,
    eventName,
    eventType,
    ballType,
    startDate,
    category,
    endDate,
    eventId,
    gender,
    notes,
  };

  return { eventInfo };
}
