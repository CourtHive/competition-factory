// Acquire
import { findExtension } from '@Helpers/extensions/findExtension';

// constants
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';

// types
import type { Event, SanctionEventConstraints, Tournament } from '@Types/tournamentTypes';

export type DrawCompositionConstraints = {
  drawSize?: number;
  maxWildcards?: number;
  maxAlternates?: number;
  maxQualifiers?: number;
};

// one event's entry in the legacy sanctioning constraints extension: how it is matched, and what it constrains
export type LegacySanctionedEventConstraints = DrawCompositionConstraints & {
  category?: { categoryName?: string };
  eventName?: string;
  eventType?: string;
};

type GetDrawCompositionConstraintsArgs = {
  tournamentRecord?: Tournament;
  event?: Event;
};

/** A legacy extension entry in the CODES shape (`sanction.constraints.events[]`). */
export function fromLegacyEventConstraints(legacy: LegacySanctionedEventConstraints): SanctionEventConstraints {
  const { eventType, eventName, category, ...limits } = legacy ?? {};
  const match = { eventType } as SanctionEventConstraints['match'];
  if (eventName) match.eventName = eventName;
  if (category?.categoryName) match.categoryName = category.categoryName;
  const constraints: SanctionEventConstraints = { match };
  for (const key of ['drawSize', 'maxWildcards', 'maxAlternates', 'maxQualifiers'] as const) {
    if (limits[key] !== undefined) constraints[key] = limits[key];
  }
  return constraints;
}

/**
 * The sanctioned event constraints a record holds: the sanction's own (`sanction.constraints`, CODES), else the legacy
 * `sanctioningConstraints` extension's, read in the same shape. The sanction's wins when both are present.
 */
export function getSanctionEventConstraints(tournamentRecord?: Tournament): SanctionEventConstraints[] {
  const own = tournamentRecord?.sanction?.constraints;
  if (own) return Array.isArray(own.events) ? own.events : [];

  const { extension } = findExtension({ element: tournamentRecord, name: SANCTIONING_CONSTRAINTS });
  const legacy: { events?: LegacySanctionedEventConstraints[] } | undefined = extension?.value;
  return Array.isArray(legacy?.events) ? legacy.events.map(fromLegacyEventConstraints) : [];
}

/**
 * Resolves draw composition constraints from the tournament's sanction constraints (or, on an older record, the
 * sanctioning constraints extension). Returns {} when none apply: an unsanctioned draw is unconstrained.
 */
export function getDrawCompositionConstraints({ tournamentRecord, event }: GetDrawCompositionConstraintsArgs): {
  constraints?: DrawCompositionConstraints;
} {
  if (!tournamentRecord) return {};

  const events = getSanctionEventConstraints(tournamentRecord);
  if (!events.length) return {};

  // Match by event metadata: eventType always, eventName and categoryName when the entry states them
  const eventConstraints = event
    ? events.find(
        ({ match }) =>
          match?.eventType === event.eventType &&
          (!match?.eventName || match.eventName === event.eventName) &&
          (!match?.categoryName || match.categoryName === event.category?.categoryName),
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
