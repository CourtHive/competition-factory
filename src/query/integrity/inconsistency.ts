import { definedAttributes } from '@Tools/definedAttributes';

// Shared vocabulary for the data-integrity query hierarchy
// (getStructureInconsistencies -> getDrawInconsistencies -> getEventInconsistencies ->
// getTournamentInconsistencies). Each layer fans out to the layer below and adds checks that
// are only visible at its own level; `finalize` stamps provenance ids + a stable fingerprint
// as results bubble upward so a caller can dedup and route by severity.

export type InconsistencySeverity = 'error' | 'warning' | 'info';
export type InconsistencyScope = 'STRUCTURE' | 'DRAW' | 'EVENT' | 'TOURNAMENT';

export type Inconsistency = {
  issueType: string;
  message: string;
  severity: InconsistencySeverity;
  scope: InconsistencyScope;
  fingerprint?: string;
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
  structureId?: string;
  matchUpId?: string;
  [key: string]: any;
};

// Identity fields the fingerprint is derived from — the granularity at which the alerting
// layer dedups (a given issueType on a given matchUp/structure is ONE issue, re-observed).
// Discriminating detail (phantomPositions, participantIds) is deliberately excluded so the
// same defect produces a stable fingerprint across repeated scans.
const IDENTITY_FIELDS = [
  'issueType',
  'tournamentId',
  'eventId',
  'drawId',
  'structureId',
  'matchUpId',
  'participantId',
  'personId',
] as const;

// FNV-1a 32-bit — a small, dependency-free, deterministic string hash. The factory ships with
// no runtime deps, so no crypto/uuid import; determinism (not cryptographic strength) is what a
// dedup fingerprint needs.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function inconsistencyFingerprint(inc: Partial<Inconsistency>): string {
  const key = IDENTITY_FIELDS.map((field) => `${field}=${inc[field] ?? ''}`).join('|');
  return fnv1a(key);
}

type FinalizeContext = {
  scope: InconsistencyScope;
  severity?: InconsistencySeverity;
  tournamentId?: string;
  eventId?: string;
  drawId?: string;
};

// Called by every layer on the combined list (its own new inconsistencies + those bubbled up
// from the layer below) immediately before returning. For each inconsistency it:
//  - fills a default scope/severity only when the inconsistency did not set its own (so a
//    STRUCTURE-scoped leaf issue keeps its scope when it passes through the DRAW layer, while a
//    new DRAW issue that omitted severity inherits the layer default);
//  - fills higher-level provenance ids (drawId/eventId/tournamentId) without overwriting ids the
//    inconsistency already carries;
//  - recomputes the fingerprint so it reflects every id known at this level.
export function finalize(inconsistencies: any[] | undefined, context: FinalizeContext): Inconsistency[] {
  const { scope, severity = 'error', tournamentId, eventId, drawId } = context;
  const ids = definedAttributes({ tournamentId, eventId, drawId });
  return (inconsistencies ?? []).map((inc) => {
    const merged = { severity, scope, ...ids, ...inc };
    return { ...merged, fingerprint: inconsistencyFingerprint(merged) };
  });
}
