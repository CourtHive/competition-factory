import { captureRecord } from '@Tools/recordDiff';
import { generatePatch } from '../../../forge/jsonPatch';
import { applyOutcomeOps } from './ops';

// constants and types
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import type { OutcomeOp } from './ops';

/**
 * The outcome pipeline, v2: the SHADOW APPLY (executor plan § 6 S1; F7 (a)). v2 writes nothing. In `differential`, a
 * complete plan is folded into a copy of the record as it stood before v1 ran, and the copy is compared with the
 * record v1 wrote. A difference is a divergence: either the plan missed a write or v1 made one the spec does not
 * state.
 *
 * STAMPS ARE COMPARED BY VALUE, but for structures. v1 stamps an entity once per call (F2 (i), CA 2026-10-19), as v2
 * does. A structure's `updatedAt` is still left out (CA, 2026-10-24, a temporary blind spot): v1's matchUp notice
 * stamps every top-level structure, F2 (i) only the matchUp's own, and that half of F2 is not yet in v1.
 */

type Json = Record<string, unknown>;

/** a record's JSON with structure stamps removed, the one part of F2 (i) v1 does not yet keep */
export function normaliseStamps(record: Json): Json {
  const visit = (structure: Json) => {
    delete structure.updatedAt;
    for (const child of (structure.structures as Json[] | undefined) ?? []) visit(child);
  };
  for (const event of (record.events as Json[] | undefined) ?? [])
    for (const drawDefinition of (event.drawDefinitions as Json[] | undefined) ?? [])
      for (const structure of (drawDefinition.structures as Json[] | undefined) ?? []) visit(structure);
  return record;
}

export type ShadowResult = { equal: true } | { equal: false; path: string; v1: string; v2: string };

const shown = (value: unknown) => (value === undefined ? 'absent' : JSON.stringify(value)?.slice(0, 160));

/**
 * Fold `ops` into the record captured before v1 ran (`before`, from `captureRecord`), and compare it with `record`, the
 * live record after v1. Returns the first difference, by JSON Pointer, with what each side holds there.
 */
export function compareShadow({
  stampedBefore,
  before,
  record,
  drawId,
  ops,
}: {
  stampedBefore?: Set<string>;
  record: Tournament;
  before: string;
  drawId: string;
  ops: OutcomeOp[];
}): ShadowResult {
  const shadow = JSON.parse(before) as Json;
  const drawDefinition = ((shadow.events as Json[] | undefined) ?? [])
    .flatMap((event) => (event.drawDefinitions as Json[] | undefined) ?? [])
    .find((draw) => draw.drawId === drawId);
  if (!drawDefinition) return { equal: false, path: `/drawDefinitions/${drawId}`, v1: 'present', v2: 'not found' };
  const applied = applyOutcomeOps(drawDefinition as unknown as DrawDefinition, ops, stampedBefore);
  if (applied.error) return { equal: false, path: '(ops)', v1: 'applied', v2: applied.error };

  const v1 = normaliseStamps(JSON.parse(captureRecord(record)) as Json);
  const v2 = normaliseStamps(JSON.parse(captureRecord(shadow)) as Json);
  const [first] = generatePatch(v2, v1);
  if (!first) return { equal: true };
  const at = (root: Json) =>
    first.path
      .split('/')
      .slice(1)
      .reduce<unknown>(
        (node, key) => (node as Json | undefined)?.[key.replaceAll('~1', '/').replaceAll('~0', '~')],
        root,
      );
  return { equal: false, path: first.path, v1: shown(at(v1)), v2: shown(at(v2)) };
}

/**
 * THE NOTICES a complete plan implies, by topic and key (executor plan § 3.5.5): the deduplicated buffer v1 leaves,
 * which a client's sync reads. Payloads are not compared in S1. Measured 2026-10-24 with every topic subscribed: a
 * matchUp written or stamped is a `modifyMatchUp`, the call's own matchUp an `updateInContextMatchUp`, the draw a
 * `modifyDrawDefinition`, and a structure an `assignPosition` writes a `modifyPositionAssignments` keyed by structureId.
 */
export function plannedNotices({ ops, matchUpId }: { ops: OutcomeOp[]; matchUpId: string }): Set<string> {
  const notices = new Set<string>([`${UPDATE_INCONTEXT_MATCHUP}|${matchUpId}`]);
  for (const op of ops) {
    if (op.op === 'assignPosition') notices.add(`${MODIFY_POSITION_ASSIGNMENTS}|${op.structureId}`);
    if (op.op !== 'stampUpdatedAt') continue;
    if (op.entity === 'matchUp') notices.add(`${MODIFY_MATCHUP}|${op.id}`);
    if (op.entity === 'drawDefinition') notices.add(`${MODIFY_DRAW_DEFINITION}|${op.id}`);
  }
  return notices;
}

/** what v1 added to the notice buffer in this call, deduplicated by topic and key, on the topics someone receives */
export function compareNotices({
  planned,
  added,
  topics,
}: {
  added: { topic?: string; key?: string }[];
  planned: Set<string>;
  topics: string[];
}): { equal: true } | { equal: false; v1: string; v2: string } {
  const subscribed = new Set(topics);
  const received = (notice: string) => subscribed.has(notice.split('|')[0]);
  const v1 = [...new Set(added.map((notice) => `${notice.topic}|${notice.key}`))].filter(received).sort();
  const v2 = [...planned].filter(received).sort();
  if (JSON.stringify(v1) === JSON.stringify(v2)) return { equal: true };
  const only = (a: string[], b: string[]) => a.filter((notice) => !b.includes(notice)).join(', ') || 'nothing more';
  return { equal: false, v1: `notices ${only(v1, v2)}`, v2: `planned ${only(v2, v1)}` };
}
