import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants and types
import { Event, TieFormat } from '@Types/tournamentTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

type WriteTieFormatTarget = {
  tieFormatId?: string;
  tieFormat?: TieFormat;
};

type WriteTieFormatArgs = {
  target: WriteTieFormatTarget;
  tieFormat: TieFormat;
  event?: Event;
};

/**
 * Writes a modified tieFormat back to a target object (event, drawDefinition, structure, or matchUp),
 * maintaining tieFormatId centralization when the target was already using a reference.
 *
 * - If the target had a `tieFormatId` (centralized): updates the centralized entry in event.tieFormats[]
 *   if no other objects share the same ID, or creates a new entry if shared.
 * - If the target had an inline `tieFormat`: writes inline (backwards-compatible).
 */
export function writeTieFormat({ target, tieFormat, event }: WriteTieFormatArgs) {
  if (!target) return;

  // If the target was using a centralized tieFormatId reference
  if (target.tieFormatId && event?.tieFormats?.length) {
    const existingId = target.tieFormatId;
    const refCount = countTieFormatReferences({ event, tieFormatId: existingId });

    if (refCount <= 1) {
      // Only this target references it — update the centralized entry in-place
      const existingIndex = event.tieFormats.findIndex((tf) => tf.tieFormatId === existingId);
      if (existingIndex >= 0) {
        const updatedTieFormat = makeDeepCopy(tieFormat, undefined, true);
        updatedTieFormat.tieFormatId = existingId;
        event.tieFormats[existingIndex] = updatedTieFormat;
        // target keeps its existing tieFormatId, no change needed
        return;
      }
    }

    // Multiple references share this ID — create a new entry so we don't affect others
    const newTieFormat = makeDeepCopy(tieFormat, undefined, true);
    // DELIBERATELY unconditional, unlike the caller-supplied-id convention applied
    // across mutate/ in 2026-08. This is copy-on-write: the whole point is to
    // diverge from the shared tieFormatId, so honouring a supplied id would write
    // back onto the format the other references still point at. Do not "complete
    // the set" by making this respect a parameter.
    newTieFormat.tieFormatId = UUID();
    event.tieFormats.push(newTieFormat);
    target.tieFormatId = newTieFormat.tieFormatId;
    delete target.tieFormat;
    return;
  }

  // Fallback: write inline (backwards-compatible for pre-aggregation state)
  target.tieFormat = tieFormat;
}

type CountReferencesArgs = {
  tieFormatId: string;
  event: Event;
};

/**
 * Counts how many objects (event, drawDefinitions, structures, matchUps)
 * in the event reference a given tieFormatId.
 */
function countTieFormatReferences({ event, tieFormatId }: CountReferencesArgs): number {
  let count = 0;

  if (event.tieFormatId === tieFormatId) count++;

  for (const drawDefinition of event.drawDefinitions ?? []) {
    if (drawDefinition.tieFormatId === tieFormatId) count++;
    for (const structure of drawDefinition.structures ?? []) {
      if (structure.tieFormatId === tieFormatId) count++;
    }
  }

  // Count matchUp-level references
  const matchUpResult = allEventMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    event,
  });
  for (const matchUp of matchUpResult.matchUps ?? []) {
    if (matchUp.tieFormatId === tieFormatId) count++;
  }

  return count;
}

/**
 * Removes entries from event.tieFormats[] that are no longer referenced
 * by any object in the event hierarchy.
 */
export function removeOrphanedTieFormats({ event }: { event: Event }) {
  if (!event?.tieFormats?.length) return;

  const referencedIds = new Set<string>();

  if (event.tieFormatId) referencedIds.add(event.tieFormatId);

  for (const drawDefinition of event.drawDefinitions ?? []) {
    if (drawDefinition.tieFormatId) referencedIds.add(drawDefinition.tieFormatId);
    for (const structure of drawDefinition.structures ?? []) {
      if (structure.tieFormatId) referencedIds.add(structure.tieFormatId);
    }
  }

  // Check matchUp-level references
  const matchUpResult = allEventMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    event,
  });
  for (const matchUp of matchUpResult.matchUps ?? []) {
    if (matchUp.tieFormatId) referencedIds.add(matchUp.tieFormatId);
  }

  event.tieFormats = event.tieFormats.filter((tf) => tf.tieFormatId && referencedIds.has(tf.tieFormatId));

  if (!event.tieFormats.length) delete event.tieFormats;
}
