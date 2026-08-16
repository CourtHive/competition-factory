import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { takeUUID } from '@Tools/UUID';

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
  /**
   * Optional pool for the copy-on-write fork below.
   *
   * NOT a `tieFormatId` parameter, deliberately. Naming the id directly would let
   * a caller write back onto the format other references still point at, which is
   * exactly what the fork exists to avoid. A pool says only "when you need to
   * mint, draw from here" — the format still diverges, still gets an id distinct
   * from the shared one, but the VALUE is reproducible.
   *
   * Why a pool is the only option here: the fork creates an entity the caller
   * never asked for, so a caller cannot pre-supply its id by naming it. TMX
   * otherwise mints at the origin and threads ids through params — whole
   * generated objects, or an explicit `uuids` pool (`addFlights`,
   * `pairFromUnified`) — which is what keeps its two executions (CFS, then the
   * local re-run on ack) in agreement. This path had no pool to thread.
   */
  uuids?: string[];
  /**
   * Within-operation cache of forks already made, keyed by the SOURCE
   * tieFormatId. Optional; omitting it preserves the previous per-target
   * behaviour.
   *
   * Why it exists: a single mutation frequently rewrites several targets that
   * all reference one shared tieFormat, with IDENTICAL new content — e.g.
   * `removeCollectionDefinition` on an aggregated event writes every TEAM
   * matchUp. Without a cache each target forks independently, so one shared
   * format fragments into N byte-identical copies, which is exactly what
   * aggregation exists to prevent. With it, the first fork mints and the rest
   * point at the same new entry.
   *
   * Content is compared before reuse, so two targets that happen to share a
   * source id but are being written with DIFFERENT formats still fork
   * separately.
   */
  forkCache?: Map<string, TieFormat>;
};

/**
 * Writes a modified tieFormat back to a target object (event, drawDefinition, structure, or matchUp),
 * maintaining tieFormatId centralization when the target was already using a reference.
 *
 * - If the target had a `tieFormatId` (centralized): updates the centralized entry in event.tieFormats[]
 *   if no other objects share the same ID, or creates a new entry if shared.
 * - If the target had an inline `tieFormat`: writes inline (backwards-compatible).
 *
 * ⚠️ RETURNS AN ERROR OBJECT. Callers currently ignore the return value, which is
 * safe ONLY because none of them thread `uuids` yet — with no pool supplied the
 * error path is unreachable. Any caller that starts passing `uuids` MUST check
 * the result and propagate, or an exhausted pool becomes a silent no-op write.
 *
 * Threading the pool through the ~20 call sites in addCollectionDefinition,
 * removeCollectionDefinition, updateTieFormat and collectionGroupUpdate is
 * deliberately NOT done piecemeal: partial threading makes replay divergence
 * intermittent (some paths reproducible, others not), which is harder to diagnose
 * than the current consistent behaviour. Do it as one pass, with error checks at
 * every site.
 */
export function writeTieFormat({ target, tieFormat, event, uuids, forkCache }: WriteTieFormatArgs) {
  if (!target) return undefined;

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
        return undefined;
      }
    }

    // Multiple references share this ID — create a new entry so we don't affect others.
    //
    // Unless this operation already forked the same source with the same content,
    // in which case join that fork rather than minting another identical entry.
    const cached = forkCache?.get(existingId);
    if (cached && !compareTieFormats({ ancestor: cached, descendant: tieFormat })?.different) {
      target.tieFormatId = cached.tieFormatId;
      delete target.tieFormat;
      return undefined;
    }

    const newTieFormat = makeDeepCopy(tieFormat, undefined, true);
    // The fork itself is unconditional — that is the point of copy-on-write — but
    // the VALUE comes from the caller's pool when one was supplied, so both
    // instances replaying this mutation land on the same id. Strict when supplied:
    // an exhausted pool is a divergence signal, not a licence to mint.
    const { uuid, error } = takeUUID({ uuids });
    if (error) return { error };

    newTieFormat.tieFormatId = uuid;
    event.tieFormats.push(newTieFormat);
    forkCache?.set(existingId, newTieFormat);
    target.tieFormatId = newTieFormat.tieFormatId;
    delete target.tieFormat;
    return undefined;
  }

  // Fallback: write inline (backwards-compatible for pre-aggregation state)
  target.tieFormat = tieFormat;
  return undefined;
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
