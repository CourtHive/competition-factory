import { Tournament } from '@Types/tournamentTypes';

/**
 * Extensions that will be silently ignored because something earlier holds the same `name`.
 *
 * `addExtension` maintains at most one extension per `name` per element — it replaces in place and
 * pushes only when absent — and every reader resolves with `.find()`, taking the FIRST match.
 * Writer and reader agree, so a record built through the API cannot trip this.
 *
 * Records assembled OUTSIDE the API can: hand-built fixtures, importers, classic-converter, and
 * anything restored from legacy storage. There, a second extension of the same name is dropped with
 * no error and no signal — the attached policy, timing override or flag simply never takes effect.
 * That is the failure this reports: not a wrong value, but a value nobody will ever read.
 *
 * Reported rather than thrown. The condition is rare, always upstream of the factory, and never
 * makes a tournament unusable — it makes one attachment inert. Refusing to load the record would be
 * a wildly disproportionate response to a duplicate flag on one venue.
 */

type ElementType = 'TOURNAMENT' | 'EVENT' | 'DRAW_DEFINITION' | 'STRUCTURE' | 'PARTICIPANT' | 'VENUE';

export type ExtensionAnomaly = {
  /** Names occurring more than once; every occurrence after the first is unreachable. */
  duplicateNames: { name: string; occurrences: number }[];
  elementType: ElementType;
  /** Absent for TOURNAMENT, which is identified by the record itself. */
  elementId?: string;
};

function duplicatesOf(element: any): { name: string; occurrences: number }[] {
  const extensions = element?.extensions;
  if (!Array.isArray(extensions) || extensions.length < 2) return [];

  const counts = new Map<string, number>();
  for (const extension of extensions) {
    const name = extension?.name;
    if (typeof name !== 'string') continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, occurrences]) => occurrences > 1)
    .map(([name, occurrences]) => ({ name, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));
}

export function getExtensionAnomalies({ tournamentRecord }: { tournamentRecord: Tournament }): ExtensionAnomaly[] {
  const anomalies: ExtensionAnomaly[] = [];

  const consider = (element: any, elementType: ElementType, elementId?: string) => {
    const duplicateNames = duplicatesOf(element);
    if (duplicateNames.length) anomalies.push({ duplicateNames, elementType, ...(elementId && { elementId }) });
  };

  consider(tournamentRecord, 'TOURNAMENT');

  for (const participant of tournamentRecord?.participants ?? [])
    consider(participant, 'PARTICIPANT', participant?.participantId);

  for (const venue of tournamentRecord?.venues ?? []) consider(venue, 'VENUE', venue?.venueId);

  for (const event of tournamentRecord?.events ?? []) {
    consider(event, 'EVENT', event?.eventId);
    for (const drawDefinition of event?.drawDefinitions ?? []) {
      consider(drawDefinition, 'DRAW_DEFINITION', drawDefinition?.drawId);
      for (const structure of drawDefinition?.structures ?? [])
        consider(structure, 'STRUCTURE', structure?.structureId);
    }
  }

  return anomalies;
}
