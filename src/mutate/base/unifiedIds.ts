import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';

/**
 * Shared write-side mechanics for the `Unified*ID` family — the arrays that record an
 * element's identity in OTHER organisations' systems (`tournamentOtherIds`,
 * `eventOtherIds`, `drawOtherIds`, `participantOtherIds`, `personOtherIds`).
 *
 * Every member of the family shares three properties, so they are enforced in one place
 * rather than re-implemented per grain:
 *
 * 1. `organisationId` is the UPSERT KEY. One entry per organisation.
 * 2. At most ONE entry may carry `isOrigin` — the system the element came from.
 * 3. The factory is deliberately neutral about what `organisationId` denotes and never
 *    validates a foreign id. Carrying identity is the whole obligation; the outside body
 *    is not expected to hold a CODES record.
 */

/** The id attributes belonging to the OTHER organisation, keyed by attribute name. */
type OriginValues = Record<string, string | undefined>;

type CheckResult = { error?: any; info?: string } | undefined;

/**
 * Rejects an array carrying more than one `isOrigin` entry.
 *
 * Readers (`eventOrigin`, `tournamentOrigin`, `drawOrigin`) deliberately stay tolerant and
 * `find` the first flagged entry, so a malformed record read from storage projects
 * deterministically rather than throwing. This is the write-side counterpart: a caller
 * cannot CREATE that ambiguity through a factory mutation.
 *
 * Not exported — `checkUnifiedIds` is the only entry point, and it has already established
 * that `entries` is an array by the time this runs.
 */
function checkSingleOrigin(entries: any[]): CheckResult {
  const flagged = entries.filter((entry: any) => entry?.isOrigin);
  if (flagged.length > 1) {
    const organisations = flagged.map((entry: any) => entry?.organisationId).join(', ');
    return {
      error: INVALID_VALUES,
      info: `At most one entry may carry isOrigin; found ${flagged.length}: ${organisations}`,
    };
  }
  return undefined;
}

/** Rejects an array whose entries do not each carry an `organisationId` — the upsert key. */
function checkOrganisationIds(entries: any[]): CheckResult {
  const missing = entries.filter((entry: any) => !entry?.organisationId).length;
  if (missing) return { error: MISSING_VALUE, info: `Every entry requires an organisationId; ${missing} missing` };
  return undefined;
}

/**
 * Validates a wholesale replacement array for any `Unified*ID` grain.
 * Returns an error result, or undefined when the array is acceptable.
 *
 * Requires a real array. Callers handle `null` (the clear) before reaching here, so anything
 * else — `undefined`, an object, a string — is a caller mistake rather than an intent, and
 * accepting it would silently write a non-array into the record.
 */
export function checkUnifiedIds(entries: any): CheckResult {
  if (!Array.isArray(entries)) return { error: INVALID_VALUES, info: 'Expected an array of Unified*ID entries' };
  return checkOrganisationIds(entries) ?? checkSingleOrigin(entries);
}

/**
 * Upsert one entry into a `Unified*ID` array, keyed on `organisationId`.
 *
 * Setting `isOrigin` is REFUSED when a different organisation already holds the flag,
 * rather than silently moving it. Re-pointing the origin is a deliberate act and belongs
 * in a wholesale `set*OtherIds` call — an upsert that quietly unflagged another entry
 * would change which system results are addressed back to, invisibly.
 *
 * Returns `{ changed: false }` when the entry already matches, so callers can skip firing
 * a notice for a genuine no-op.
 */
export function upsertUnifiedId({
  uniqueOrganisationName,
  organisationId,
  isOrigin,
  entries,
  values,
}: {
  uniqueOrganisationName?: string;
  organisationId: string;
  isOrigin?: boolean;
  entries: any[];
  values: OriginValues;
}): { error?: any; info?: string; changed?: boolean } {
  const conflicting = entries.find((entry: any) => entry?.isOrigin && entry.organisationId !== organisationId);
  if (isOrigin && conflicting) {
    return {
      error: INVALID_VALUES,
      info: `isOrigin is already held by organisationId '${conflicting.organisationId}'; replace the array wholesale to re-point the origin`,
    };
  }

  const supplied = Object.entries(values).filter(([, value]) => value !== undefined);
  const existing = entries.find((entry: any) => entry?.organisationId === organisationId);

  if (!existing) {
    entries.push({
      organisationId,
      ...Object.fromEntries(supplied),
      ...(uniqueOrganisationName ? { uniqueOrganisationName } : {}),
      ...(isOrigin ? { isOrigin: true } : {}),
      createdAt: new Date().toISOString(),
    });
    return { changed: true };
  }

  const nameChanges = !!uniqueOrganisationName && existing.uniqueOrganisationName !== uniqueOrganisationName;
  const originChanges = !!isOrigin && !existing.isOrigin;
  const valueChanges = supplied.some(([attribute, value]) => existing[attribute] !== value);
  if (!nameChanges && !originChanges && !valueChanges) return { changed: false }; // idempotent no-op

  for (const [attribute, value] of supplied) existing[attribute] = value;
  if (nameChanges) existing.uniqueOrganisationName = uniqueOrganisationName;
  if (originChanges) existing.isOrigin = true;
  existing.updatedAt = new Date().toISOString();

  return { changed: true };
}
