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
 * Person-resolution rule (CA-locked). Populate `person_id` ONLY when the
 * participant's `personId` is a real canonical person:
 *   1. `personId === participantId` → synthetic/local → skip (equal ids mean no
 *      real linkage).
 *   2. `personId` IS a factory UUID → also synthetic/generated → skip.
 *   3. otherwise (a non-UUID id — almost certainly a providerId/federation id
 *      such as a UTR id) → REAL person → populate, link_source='providerId'.
 *
 * BOBOCA / HTS / CTS records (pulled from UTR data) carry real provider
 * personIds and resolve; courthive-ingest MUST generate UUID participantIds so
 * this test cleanly separates the real person from the synthetic participant.
 */
export function resolvePersonLink(participantId?: string, personId?: string): PersonLink {
  if (personId && personId !== participantId && !isFactoryUuid(personId)) {
    return { personId, linkSource: LINK_PROVIDER_ID };
  }
  return { personId: null, linkSource: LINK_UNRESOLVED };
}
