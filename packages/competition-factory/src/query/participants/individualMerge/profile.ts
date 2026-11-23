import { isFactoryUuid } from '@Query/readModel/personRule';
import { canonicalJson } from '@Tools/canonicalJson';

// constants and types
import type { Participant } from '@Types/tournamentTypes';
import type {
  IndividualMergeBlocker,
  IndividualMergeConflict,
  IndividualMergeResolutions,
} from '@Types/individualParticipantMerge';

const UNION_FIELDS = new Set(['contacts', 'onlineResources', 'previousNames']);
const HISTORY_FIELDS = new Set(['timeItems', 'presence', 'penalties']);
const ISSUED_IDS = new Set(['personOtherIds', 'participantOtherIds']);
const STAMPS = new Set(['createdAt', 'updatedAt']);

export function mergeIndividualProfile(
  source: Participant,
  target: Participant,
  resolutions: IndividualMergeResolutions,
) {
  const conflicts: IndividualMergeConflict[] = [];
  const blockers: IndividualMergeBlocker[] = [];
  const usedResolutions = new Set<string>();
  const participant = mergeValue(source, target, '', {
    resolutions,
    conflicts,
    blockers,
    usedResolutions,
  }) as Participant;
  participant.participantId = target.participantId;
  // Entry choices are consumed while references are rewritten; the planner reports unused choices afterwards.
  return { participant, conflicts, blockers, usedResolutions };
}

type MergeContext = {
  resolutions: IndividualMergeResolutions;
  conflicts: IndividualMergeConflict[];
  blockers: IndividualMergeBlocker[];
  usedResolutions: Set<string>;
};
function mergeValue(source: unknown, target: unknown, path: string, context: MergeContext): unknown {
  const field = path.split('/').at(-1) ?? '';
  if (field === 'participantId' || STAMPS.has(field)) return target;
  if (source === undefined || source === null || source === '') return target;
  if (target === undefined || target === null || target === '') return source;
  if (canonicalJson(source) === canonicalJson(target)) return target;
  if (field === 'personId') return mergePersonId(source, target, path, context);
  if (ISSUED_IDS.has(field) && Array.isArray(source) && Array.isArray(target)) {
    return mergeIssuedIds(source, target, path, context);
  }
  if (field === 'contacts' && Array.isArray(source) && Array.isArray(target)) return mergeContacts(source, target);
  if (UNION_FIELDS.has(field) && Array.isArray(source) && Array.isArray(target)) return union(source, target);
  if (HISTORY_FIELDS.has(field) && Array.isArray(source) && Array.isArray(target)) {
    if (field !== 'timeItems' || timeItemsConflict(source, target))
      context.blockers.push({ code: 'HISTORY_CONFLICT', path });
    return union(source, target);
  }
  if (isRecord(source) && isRecord(target)) {
    return Object.fromEntries(
      [...new Set([...Object.keys(target), ...Object.keys(source)])].map((key) => [
        key,
        mergeValue(source[key], target[key], `${path}/${key}`, context),
      ]),
    );
  }
  const choice = context.resolutions[path];
  context.conflicts.push({ path, source, target });
  if (choice === 'source' || choice === 'target') context.usedResolutions.add(path);
  return choice === 'source' ? source : target;
}
function mergePersonId(source: unknown, target: unknown, path: string, context: MergeContext) {
  const trustedSource = typeof source === 'string' && !isFactoryUuid(source);
  const trustedTarget = typeof target === 'string' && !isFactoryUuid(target);
  if (trustedSource && trustedTarget) context.blockers.push({ code: 'PERSON_ID_CONFLICT', path });
  if (trustedTarget) return target;
  return trustedSource ? source : target;
}
function mergeIssuedIds(source: unknown[], target: unknown[], path: string, context: MergeContext) {
  if (![...source, ...target].every(isRecord)) {
    context.blockers.push({ code: 'INVALID_ISSUED_ID', path });
    return target;
  }
  const ids = dedupeIssuedIds([...target, ...source] as Record<string, unknown>[]);
  const authorities = new Map<string, string>();
  for (const id of ids) {
    const authority = String(id.organisationId ?? id.uniqueOrganisationName ?? '');
    const value = String(id.personId ?? id.participantId ?? '');
    if (!authority || !value || (authorities.has(authority) && authorities.get(authority) !== value)) {
      context.blockers.push({ code: 'ISSUED_ID_CONFLICT', path });
    }
    authorities.set(authority, value);
  }
  return ids;
}
/** One entry per (issuer, value): copies differing only in stamps would leave a stale id behind a later re-issue. */
function dedupeIssuedIds(ids: Record<string, unknown>[]) {
  const kept = new Map<string, Record<string, unknown>>();
  for (const id of ids) {
    const key = canonicalJson([id.organisationId ?? id.uniqueOrganisationName, id.personId ?? id.participantId]);
    const prior = kept.get(key);
    if (!prior || String(id.createdAt ?? '￿') < String(prior.createdAt ?? '￿')) kept.set(key, id);
  }
  return [...kept.values()];
}
function union(source: unknown[], target: unknown[]) {
  const values = new Map([...target, ...source].map((value) => [canonicalJson(value), value]));
  return [...values.values()];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeContacts(source: unknown[], target: unknown[]) {
  const contacts = union(source, target);
  return contacts.map((contact) => {
    if (!isRecord(contact)) return contact;
    const sameAddress = contacts.filter(
      (other) =>
        isRecord(other) &&
        ['emailAddress', 'telephone', 'mobileTelephone'].some(
          (field) => contact[field] && contact[field] === other[field],
        ),
    );
    if (sameAddress.some((other) => isRecord(other) && other.isPublic !== true)) return { ...contact, isPublic: false };
    return contact;
  });
}

function timeItemsConflict(source: unknown[], target: unknown[]) {
  const values = (items: unknown[]) => {
    const map = new Map<string, unknown>();
    const sorted = items
      .filter(isRecord)
      .toSorted(
        (a, b) =>
          (a.createdAt ? new Date(a.createdAt as string).getTime() : 0) -
          (b.createdAt ? new Date(b.createdAt as string).getTime() : 0),
      );
    for (const item of sorted) map.set(String(item.itemType), item.itemValue);
    return map;
  };
  const a = values(source);
  const b = values(target);
  return [...a].some(([type, value]) => b.has(type) && canonicalJson(value) !== canonicalJson(b.get(type)));
}
