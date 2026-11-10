// Acquire
import { findExtension } from '@Helpers/extensions/findExtension';

// constants
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

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

const CONSTRAINT_KEYS = new Set(['drawSize', 'maxWildcards', 'maxAlternates', 'maxQualifiers']);

type GetDrawCompositionConstraintsArgs = {
  tournamentRecord?: Tournament;
  event?: Event;
  constraintOverrides?: DrawCompositionConstraints;
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
export function getDrawCompositionConstraints({
  tournamentRecord,
  event,
  constraintOverrides,
}: GetDrawCompositionConstraintsArgs): {
  constraints?: DrawCompositionConstraints;
  overrideLimits?: DrawCompositionConstraints;
  error?: typeof INVALID_VALUES;
} {
  if (!tournamentRecord) return constraintOverrides !== undefined ? { error: INVALID_VALUES } : {};

  const events = getSanctionEventConstraints(tournamentRecord);
  if (!events.length) return constraintOverrides !== undefined ? { error: INVALID_VALUES } : {};

  // Match by event metadata: eventType always, eventName and categoryName when the entry states them
  const eventConstraints = event
    ? events.find(
        ({ match }) =>
          match?.eventType === event.eventType &&
          (!match?.eventName || match.eventName === event.eventName) &&
          (!match?.categoryName || match.categoryName === event.category?.categoryName),
      )
    : undefined;

  if (!eventConstraints) return constraintOverrides !== undefined ? { error: INVALID_VALUES } : {};

  const constraints: DrawCompositionConstraints = {};
  if (eventConstraints.drawSize !== undefined) constraints.drawSize = eventConstraints.drawSize;
  if (eventConstraints.maxWildcards !== undefined) constraints.maxWildcards = eventConstraints.maxWildcards;
  if (eventConstraints.maxAlternates !== undefined) constraints.maxAlternates = eventConstraints.maxAlternates;
  if (eventConstraints.maxQualifiers !== undefined) constraints.maxQualifiers = eventConstraints.maxQualifiers;

  // Permission is read only from the authoritative CODES sanction record, never a caller flag or legacy extension.
  const overrideLimits = tournamentRecord.sanction?.constraints?.definedBy?.providerId
    ? eventConstraints.overrideLimits
    : undefined;
  const error = applyRequestedLimits(constraints, overrideLimits, constraintOverrides);
  if (error) return { error };
  return {
    ...(Object.keys(constraints).length ? { constraints } : {}),
    ...(overrideLimits && { overrideLimits: { ...overrideLimits } }),
  };
}

/** A draft record with the permitted limits applied; the sanction record itself is never changed. */
export function resolveDrawCompositionOverrides({
  tournamentRecord,
  event,
  constraintOverrides,
}: GetDrawCompositionConstraintsArgs) {
  const result = getDrawCompositionConstraints({ tournamentRecord, event, constraintOverrides });
  if (result.error) return { ...result, tournamentRecord: undefined };
  if (!constraintOverrides || !tournamentRecord?.sanction?.constraints) return { ...result, tournamentRecord };
  const sanction = tournamentRecord.sanction;
  const constraints = sanction.constraints!;
  const events = constraints.events.map((record) => {
    const matches =
      record.match.eventType === event?.eventType &&
      (!record.match.eventName || record.match.eventName === event?.eventName) &&
      (!record.match.categoryName || record.match.categoryName === event?.category?.categoryName);
    return matches ? { ...record, ...result.constraints } : record;
  });
  return {
    ...result,
    tournamentRecord: { ...tournamentRecord, sanction: { ...sanction, constraints: { ...constraints, events } } },
  };
}

function applyRequestedLimits(
  constraints: DrawCompositionConstraints,
  overrideLimits: DrawCompositionConstraints | undefined,
  constraintOverrides: DrawCompositionConstraints | undefined,
): typeof INVALID_VALUES | undefined {
  if (constraintOverrides !== undefined) {
    if (!constraintOverrides || typeof constraintOverrides !== 'object' || Array.isArray(constraintOverrides))
      return INVALID_VALUES;
    for (const [key, value] of Object.entries(constraintOverrides)) {
      if (!CONSTRAINT_KEYS.has(key) || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        return INVALID_VALUES;
      const limitKey = key as keyof DrawCompositionConstraints;
      const limit = constraints[limitKey];
      if (limit === undefined) return INVALID_VALUES;
      if (value > limit) {
        const ceiling =
          overrideLimits && Object.hasOwn(overrideLimits, limitKey) ? overrideLimits[limitKey] : undefined;
        if (typeof ceiling !== 'number' || !Number.isSafeInteger(ceiling) || ceiling < value) return INVALID_VALUES;
      }
      constraints[limitKey] = value;
    }
  }
  return undefined;
}
