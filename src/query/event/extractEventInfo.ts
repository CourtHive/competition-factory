import { getEventPlayingDates } from '@Query/events/eventPlaysOnDate';
import { structuresOf } from '@Acquire/structureMembers';

import type { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import type { TournamentEventInfo } from '@Types/viewTypes';

/**
 * Walk a structure tree collecting declared matchUpFormat codes.
 *
 * Round-robin item structures nest under `structure.structures`, so this
 * recurses rather than reading one level.
 */
function collectStructureMatchUpFormats(structures: Structure[] | undefined, collected: Set<string>): void {
  for (const structure of structures ?? []) {
    if (structure?.matchUpFormat) collected.add(structure.matchUpFormat);
    collectStructureMatchUpFormats(structuresOf(structure), collected);
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

/**
 * An event's playing days for a public payload: present only when the event's own dates, active dates or weekdays
 * narrow the days its tournament plays, so an unconstrained event adds nothing to the payload.
 */
export function constrainedPlayingDates(tournamentRecord?: Tournament, event?: Event): string[] | undefined {
  if (!tournamentRecord || !event) return undefined;
  const { playingDates, constrained } = getEventPlayingDates({ tournamentRecord, event });
  return constrained ? playingDates : undefined;
}

export function extractEventInfo({ event, tournamentRecord }: { event: Event; tournamentRecord?: Tournament }): {
  eventInfo: TournamentEventInfo;
} {
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
  } = event as Event & { ballType?: string; onlineResources?: any };

  const entriesCount = event.entries?.length ?? 0;

  // Distinct codes from anywhere in the event. Omitted when empty so events
  // that declare no format keep their existing payload shape, matching the
  // undefined-valued fields alongside.
  const matchUpFormats = getEventMatchUpFormats(event);

  const eventInfo = {
    drawDefinitionCount: event.drawDefinitions?.length,
    matchUpFormats: matchUpFormats.length ? matchUpFormats : undefined,
    playingDates: constrainedPlayingDates(tournamentRecord, event),
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
