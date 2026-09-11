// match_up_competitors.link_source / entries person-resolution outcomes.
export const LINK_PROVIDER_ID = 'providerId';
export const LINK_UNRESOLVED = 'unresolved';

// A factory-generated id (tools.UUID). Two shapes:
//   - bare RFC-4122 v4:  xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
//   - prefixed form:     <prefix>_<32 lowercase hex>  (UUID(pre) strips dashes)
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIXED_UUID = /^[A-Za-z][A-Za-z0-9]*_[0-9a-f]{32}$/;

export interface PersonLink {
  personId: string | null;
  linkSource: string;
}

/**
 * True when `id` looks like a factory `tools.UUID()` value — a synthetic,
 * locally-generated id, NOT a real canonical/provider person id.
 */
export function isFactoryUuid(id?: string | null): boolean {
  if (typeof id !== 'string' || !id) return false;
  return UUID_V4.test(id) || PREFIXED_UUID.test(id);
}

/**
 * Person-resolution rule (CA-locked; revised 2026-07-29). Populate `person_id`
 * whenever the participant's `personId` is NOT a factory `tools.UUID()` value —
 * i.e. it is a real provider/federation id (e.g. a UTR id):
 *   1. `personId` absent → skip.
 *   2. `personId` IS a factory UUID → synthetic/generated → skip.
 *   3. otherwise (a non-UUID id) → REAL person → populate, link_source='providerId'.
 *
 * `personId === participantId` is NOT a skip signal. Some importers (IONSPORT →
 * BOBOCA/HTS/CTS) reuse the real provider personId AS the participantId, so a
 * non-UUID id equal to the participantId is still a real person and MUST resolve.
 * The ONLY synthetic marker is the factory-UUID shape. (`participantId` stays in
 * the signature for call-site symmetry but no longer gates.) courthive-ingest
 * SHOULD still generate UUID participantIds, but the rule no longer depends on it.
 */
export function resolvePersonLink(_participantId?: string, personId?: string): PersonLink {
  if (personId && !isFactoryUuid(personId)) {
    return { personId, linkSource: LINK_PROVIDER_ID };
  }
  return { personId: null, linkSource: LINK_UNRESOLVED };
}
