import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import { FLIGHT_PROFILE, INDIVIDUAL_PARTICIPANT_MERGES } from '@Constants/extensionConstants';
import type {
  IndividualMergeBlocker,
  IndividualMergeConflict,
  IndividualMergeResolutions,
} from '@Types/individualParticipantMerge';

const REFERENCE_FIELDS = new Set([
  'participantId',
  'homeParticipantId',
  'scorekeeperParticipantId',
  'timekeeperParticipantId',
]);
const REFERENCE_ARRAYS = new Set(['participantIds', 'individualParticipantIds', 'contactParticipantIds']);
const IDENTITY_FIELDS = new Set(['person', 'participantOtherIds', 'personId']);
const OPAQUE_FIELDS = new Set(['extensions', 'timeItems']);
const ENTRY_LISTS = new Set(['entries', 'drawEntries']);
// Ordering and stamps differ between any two entries of one event; they never express a registration choice.
const ENTRY_INCIDENTAL = new Set(['participantId', 'entryPosition', 'createdAt', 'updatedAt']);

export type ReferenceContext = {
  source: string;
  target: string;
  blockers: IndividualMergeBlocker[];
  changedPaths: string[];
  retiredPersonIds?: Set<string>;
  resolutions: IndividualMergeResolutions;
  conflicts: IndividualMergeConflict[];
  usedResolutions: Set<string>;
};

/** Only registered reference fields are rewritten; unknown ID-bearing payloads refuse the plan. */
export function rewriteIndividualReferences(value: unknown, path: string, context: ReferenceContext): unknown {
  if (Array.isArray(value))
    return value.map((item, index) => rewriteIndividualReferences(item, `${path}/${index}`, context));
  if (!isRecord(value)) {
    if (value === context.source || (typeof value === 'string' && context.retiredPersonIds?.has(value)))
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path });
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (key === context.source || context.retiredPersonIds?.has(key))
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
    if (key === 'person') {
      checkPersonExtensions(item, childPath, context);
      result[key] = item;
      continue;
    }
    if (
      key === 'personId' &&
      typeof item === 'string' &&
      context.retiredPersonIds?.has(item) &&
      !/^\/participants\/\d+$/.test(path)
    )
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
    if (IDENTITY_FIELDS.has(key)) {
      result[key] = item;
      continue;
    }
    if (key === 'extensions' && Array.isArray(item)) {
      result[key] = item.map((extension, index) => {
        const extensionPath = `${childPath}/${index}`;
        // A flight profile lists draw entries before any draw exists: references, not opaque data.
        if (!isRecord(extension) || extension.name !== FLIGHT_PROFILE) {
          if (!(isRecord(extension) && extension.name === INDIVIDUAL_PARTICIPANT_MERGES && path === ''))
            checkOpaque(extension, extensionPath, context);
          return extension;
        }
        return { ...extension, value: rewriteIndividualReferences(extension.value, `${extensionPath}/value`, context) };
      });
    } else if (OPAQUE_FIELDS.has(key)) {
      checkOpaque(item, childPath, context);
      result[key] = item;
    } else if (REFERENCE_FIELDS.has(key) && item === context.source) {
      result[key] = context.target;
      context.changedPaths.push(childPath);
    } else if (REFERENCE_ARRAYS.has(key) && Array.isArray(item)) {
      result[key] = [
        ...new Set(
          item.map((id) => {
            if (id !== context.source) return id;
            context.changedPaths.push(childPath);
            return context.target;
          }),
        ),
      ];
    } else if (item === context.source || (typeof item === 'string' && context.retiredPersonIds?.has(item))) {
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
      result[key] = item;
    } else {
      result[key] = rewriteIndividualReferences(item, childPath, context);
    }
  }
  for (const key of ENTRY_LISTS) {
    const original = value[key];
    if (Array.isArray(result[key]) && Array.isArray(original))
      result[key] = reconcileEntries(original, result[key] as unknown[], `${path}/${key}`, context);
  }
  return result;
}

function checkOpaque(value: unknown, path: string, context: ReferenceContext) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) checkOpaque(item, `${path}/${index}`, context);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === context.source || context.retiredPersonIds?.has(key))
        context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: `${path}/${key}` });
      checkOpaque(item, `${path}/${key}`, context);
    }
  } else if (value === context.source || (typeof value === 'string' && context.retiredPersonIds?.has(value)))
    context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path });
}

/**
 * Two entries for one stage now name the survivor. Keep one: the survivor's own ordering, and an explicit choice for
 * every registration field on which the two entries disagree (path: the survivor's entry index plus the field).
 */
function reconcileEntries(originals: unknown[], entries: unknown[], path: string, context: ReferenceContext) {
  const kept = new Map<string, number>();
  const result: unknown[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry) || entry.participantId !== context.target) {
      result.push(entry);
      continue;
    }
    const scope = canonicalJson(entry.entryStage ?? null);
    const prior = kept.get(scope);
    if (prior === undefined) {
      kept.set(scope, index);
      result.push(entry);
      continue;
    }
    const fromSource = (at: number) => isRecord(originals[at]) && originals[at].participantId === context.source;
    if (fromSource(prior) === fromSource(index)) {
      // Neither entry belonged to the retired participant: an existing duplicate this merge did not create.
      if (canonicalJson(entries[prior]) !== canonicalJson(entry))
        context.blockers.push({ code: 'ENTRY_CONFLICT', path: `${path}/${index}` });
      continue;
    }
    const [targetAt, sourceAt] = fromSource(prior) ? [index, prior] : [prior, index];
    const merged = mergeEntry(
      entries[targetAt] as Record<string, unknown>,
      entries[sourceAt] as Record<string, unknown>,
      `${path}/${targetAt}`,
      context,
    );
    result[result.indexOf(entries[prior])] = merged;
  }
  return result;
}

function mergeEntry(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  path: string,
  context: ReferenceContext,
) {
  const merged: Record<string, unknown> = { ...target };
  for (const key of new Set([...Object.keys(target), ...Object.keys(source)])) {
    if (ENTRY_INCIDENTAL.has(key) || source[key] === undefined) continue;
    if (target[key] === undefined) {
      merged[key] = source[key];
      continue;
    }
    if (canonicalJson(source[key]) === canonicalJson(target[key])) continue;
    const fieldPath = `${path}/${key}`;
    const choice = context.resolutions[fieldPath];
    context.conflicts.push({ path: fieldPath, source: source[key], target: target[key] });
    if (choice) context.usedResolutions.add(fieldPath);
    if (choice === 'source') merged[key] = source[key];
  }
  return merged;
}

/** Direct references only: do not expand unrelated groups as query hydration does. */
export function collectParticipantReferences(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const item of value) collectParticipantReferences(item, ids);
  else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (IDENTITY_FIELDS.has(key) || OPAQUE_FIELDS.has(key)) continue;
      if (REFERENCE_FIELDS.has(key) && typeof item === 'string') ids.add(item);
      else if (REFERENCE_ARRAYS.has(key) && Array.isArray(item)) {
        for (const id of item) if (typeof id === 'string') ids.add(id);
      } else collectParticipantReferences(item, ids);
    }
  }
  return ids;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function checkPersonExtensions(value: unknown, path: string, context: ReferenceContext) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkPersonExtensions(item, `${path}/${index}`, context));
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'personId' || key === 'personOtherIds') continue;
    if (OPAQUE_FIELDS.has(key) || key.endsWith('ParticipantId') || key.endsWith('ParticipantIds'))
      checkOpaque(item, `${path}/${key}`, context);
    else checkPersonExtensions(item, `${path}/${key}`, context);
  }
}
