// Acquire
import { findExtension } from '@Acquire/findExtension';

// Constants
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';

// Types
import type { Event, Tournament } from '@Types/tournamentTypes';

export type DrawCompositionConstraints = {
  drawSize?: number;
  maxWildcards?: number;
  maxAlternates?: number;
  maxQualifiers?: number;
};

type GetDrawCompositionConstraintsArgs = {
  tournamentRecord?: Tournament;
  event?: Event;
};

/**
 * Resolves draw composition constraints from the sanctioning constraints
 * extension on the tournament record. Returns undefined when no sanctioning
 * constraints exist (unsanctioned draws are unconstrained).
 */
export function getDrawCompositionConstraints({
  tournamentRecord,
  event,
}: GetDrawCompositionConstraintsArgs): { constraints?: DrawCompositionConstraints } {
  if (!tournamentRecord) return {};

  const { extension } = findExtension({
    element: tournamentRecord,
    name: SANCTIONING_CONSTRAINTS,
  });

  const sanctioningConstraints = extension?.value;
  if (!sanctioningConstraints?.events?.length) return {};

  // Match by event metadata
  const eventConstraints = event
    ? sanctioningConstraints.events.find(
        (ec: any) =>
          ec.eventType === event.eventType &&
          (!ec.eventName || ec.eventName === event.eventName) &&
          (!ec.category?.categoryName || ec.category?.categoryName === event.category?.categoryName),
      )
    : undefined;

  if (!eventConstraints) return {};

  const constraints: DrawCompositionConstraints = {};
  if (eventConstraints.drawSize !== undefined) constraints.drawSize = eventConstraints.drawSize;
  if (eventConstraints.maxWildcards !== undefined) constraints.maxWildcards = eventConstraints.maxWildcards;
  if (eventConstraints.maxAlternates !== undefined) constraints.maxAlternates = eventConstraints.maxAlternates;
  if (eventConstraints.maxQualifiers !== undefined) constraints.maxQualifiers = eventConstraints.maxQualifiers;

  return Object.keys(constraints).length ? { constraints } : {};
}
