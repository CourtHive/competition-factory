import { generatePatch } from '../../../forge/jsonPatch';
import { captureRecord } from '@Tools/recordDiff';

/** Accepted-call measurement, not an outcome oracle: omitted writes may be legitimate. */
export type ProjectionAuditCounts = {
  accepted: number;
  sampled: number;
  recordChanged: number;
  projectionChanged: number;
  projectionMisses: number;
  omittedWrites: number;
  omittedFields: Record<string, number>;
  examples: { seed: number; acceptedCall: number; path: string; projectionChanged: boolean }[];
};
export type ProjectionAudit = ProjectionAuditCounts & { seed: number; every: number };

export const emptyProjectionAuditCounts = (): ProjectionAuditCounts => ({
  accepted: 0,
  sampled: 0,
  recordChanged: 0,
  projectionChanged: 0,
  projectionMisses: 0,
  omittedWrites: 0,
  omittedFields: {},
  examples: [],
});

/** Separate sampling clock: never consumes the scenario's generation RNG or generated ids. */
export function createProjectionAudit(seed: number, every = 32): ProjectionAudit {
  if (!Number.isSafeInteger(every) || every < 1)
    throw new Error('projection audit interval must be a positive integer');
  return { ...emptyProjectionAuditCounts(), seed, every };
}

const PROJECTED_MATCHUP_FIELDS = new Set([
  'matchUpId',
  'matchUpStatus',
  'winningSide',
  'drawPositions',
  'matchUpStatusCodes',
  'sideExitProvenance',
  'score',
]);
const VOLATILE_KEYS = new Set(['updatedAt', 'createdAt', 'timeStamp', 'timestamp']);
const isIndex = (key: string | undefined) => key !== undefined && /^\d+$/.test(key);

function readPath(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Match the actual projection's location, not a leaf name shared by a nested TEAM line or another draw. */
function isProjectedPath(path: string, record: unknown, drawId: string): boolean {
  const keys = path
    .split('/')
    .slice(1)
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (keys[0] !== 'events' || !isIndex(keys[1]) || keys[2] !== 'drawDefinitions' || !isIndex(keys[3])) return false;
  if (readPath(record, [...keys.slice(0, 4), 'drawId']) !== drawId) return false;
  let index = 4;
  while (keys[index] === 'structures' && isIndex(keys[index + 1])) index += 2;
  if (index === 4) return false;
  if (keys[index] === 'structureId' && keys.length === index + 1) return true;
  if (keys[index] === 'matchUps' && isIndex(keys[index + 1])) return PROJECTED_MATCHUP_FIELDS.has(keys[index + 2]);
  if (keys[index] === 'positionAssignments') return !keys.slice(index + 1).some((key) => VOLATILE_KEYS.has(key));
  return false;
}

export function auditAcceptedRecord({
  audit,
  before,
  record,
  drawId,
  projectionChanged,
}: {
  audit: ProjectionAudit;
  before: string;
  record: unknown;
  drawId: string;
  projectionChanged: boolean;
}): void {
  audit.accepted += 1;
  if (((audit.seed >>> 0) + audit.accepted - 1) % audit.every !== 0) return;
  audit.sampled += 1;
  const prior: unknown = JSON.parse(before);
  const later: unknown = JSON.parse(captureRecord(record));
  const changes = generatePatch(prior, later);
  if (projectionChanged) audit.projectionChanged += 1;
  if (!changes.length) return;
  audit.recordChanged += 1;
  if (!projectionChanged) audit.projectionMisses += 1;
  const omitted = changes.filter(
    (change) => !isProjectedPath(change.path, prior, drawId) && !isProjectedPath(change.path, later, drawId),
  );
  audit.omittedWrites += omitted.length;
  for (const change of omitted) {
    const field = change.path.replaceAll(/\/\d+(?=\/|$)/g, '/*');
    audit.omittedFields[field] = (audit.omittedFields[field] ?? 0) + 1;
  }
  const first = omitted[0] ?? (!projectionChanged ? changes[0] : undefined);
  if (first && audit.examples.length < 8)
    audit.examples.push({
      seed: audit.seed,
      acceptedCall: audit.accepted,
      path: first.path,
      projectionChanged,
    });
}

export function mergeProjectionAudit(total: ProjectionAuditCounts, audit: ProjectionAuditCounts): void {
  total.accepted += audit.accepted;
  total.sampled += audit.sampled;
  total.recordChanged += audit.recordChanged;
  total.projectionChanged += audit.projectionChanged;
  total.projectionMisses += audit.projectionMisses;
  total.omittedWrites += audit.omittedWrites;
  for (const [field, count] of Object.entries(audit.omittedFields))
    total.omittedFields[field] = (total.omittedFields[field] ?? 0) + count;
  total.examples.push(...audit.examples.slice(0, Math.max(0, 8 - total.examples.length)));
}
