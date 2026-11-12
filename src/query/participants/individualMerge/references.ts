import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { IndividualMergeBlocker } from '@Types/individualParticipantMerge';
import { INDIVIDUAL_PARTICIPANT_MERGES } from '@Constants/extensionConstants';

const REFERENCE_FIELDS = new Set([
  'participantId',
  'homeParticipantId',
  'scorekeeperParticipantId',
  'timekeeperParticipantId',
]);
const REFERENCE_ARRAYS = new Set(['participantIds', 'individualParticipantIds', 'contactParticipantIds']);
const IDENTITY_FIELDS = new Set(['person', 'participantOtherIds', 'personId']);
const OPAQUE_FIELDS = new Set(['extensions', 'timeItems']);

export type ReferenceContext = {
  source: string;
  target: string;
  blockers: IndividualMergeBlocker[];
  changedPaths: string[];
  retiredPersonIds?: string[];
};

/** Only registered reference fields are rewritten; unknown ID-bearing payloads refuse the plan. */
export function rewriteIndividualReferences(value: unknown, path: string, context: ReferenceContext): unknown {
  if (Array.isArray(value))
    return value.map((item, index) => rewriteIndividualReferences(item, `${path}/${index}`, context));
  if (!isRecord(value)) {
    if (value === context.source || (typeof value === 'string' && context.retiredPersonIds?.includes(value)))
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path });
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    if (key === context.source || context.retiredPersonIds?.includes(key))
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
    if (key === 'person') {
      checkPersonExtensions(item, childPath, context);
      result[key] = item;
      continue;
    }
    if (
      key === 'personId' &&
      typeof item === 'string' &&
      context.retiredPersonIds?.includes(item) &&
      !/^\/participants\/\d+$/.test(path)
    )
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
    if (IDENTITY_FIELDS.has(key)) {
      result[key] = item;
      continue;
    }
    if (OPAQUE_FIELDS.has(key)) {
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
    } else if (item === context.source || (typeof item === 'string' && context.retiredPersonIds?.includes(item))) {
      context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: childPath });
      result[key] = item;
    } else {
      result[key] = rewriteIndividualReferences(item, childPath, context);
    }
  }
  if (Array.isArray(result.entries)) result.entries = reconcileEntries(result.entries, `${path}/entries`, context);
  return result;
}

function checkOpaque(value: unknown, path: string, context: ReferenceContext) {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (path === '/extensions' && isRecord(item) && item.name === INDIVIDUAL_PARTICIPANT_MERGES) continue;
      checkOpaque(item, `${path}/${index}`, context);
    }
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === context.source || context.retiredPersonIds?.includes(key))
        context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path: `${path}/${key}` });
      checkOpaque(item, `${path}/${key}`, context);
    }
  } else if (value === context.source || (typeof value === 'string' && context.retiredPersonIds?.includes(value)))
    context.blockers.push({ code: 'UNSUPPORTED_REFERENCE', path });
}

function reconcileEntries(entries: unknown[], path: string, context: ReferenceContext) {
  const scoped = new Map<string, unknown>();
  const result: unknown[] = [];
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry) || entry.participantId !== context.target) {
      result.push(entry);
      continue;
    }
    const scope = canonicalJson([entry.participantId, entry.entryStage ?? null]);
    if (scoped.has(scope)) {
      if (canonicalJson(scoped.get(scope)) !== canonicalJson(entry)) {
        context.blockers.push({ code: 'ENTRY_CONFLICT', path: `${path}/${index}` });
      }
    } else {
      scoped.set(scope, entry);
      result.push(entry);
    }
  }
  return result;
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
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'personId' || key === 'personOtherIds') continue;
    if (OPAQUE_FIELDS.has(key) || key.endsWith('ParticipantId') || key.endsWith('ParticipantIds'))
      checkOpaque(item, `${path}/${key}`, context);
    else checkPersonExtensions(item, `${path}/${key}`, context);
  }
}
