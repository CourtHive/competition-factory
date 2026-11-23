import { structuresOf } from '@Helpers/drawTopology/structureMembers';
import { buildDependencies, readGrant, slotKey, type Frame } from './dependencies';
import { reconcileReceiver, sameGrant, type Input } from './receiver';

import type { PolicyDefinitions } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeFlags } from '../types';
import type { WorkingView } from '../overlay';
import type { withdrawnAwardRelease } from './release';
import type { OutcomeOp } from '../ops';

type Trigger = 'match' | 'assignment';
export type Visit = { pass: string; matchUpId: string; trigger: Trigger };

/** Call-local. Stable order is the actual match enumeration within each pass. The queue holds
 * consumers, never a permanent visited flag. A later fold invalidates the same consumer again. */
export function settlementWorklist(
  working: WorkingView,
  flags: OutcomeFlags,
  policies?: PolicyDefinitions,
  release?: ReturnType<typeof withdrawnAwardRelease>,
) {
  const dependencies = buildDependencies(working);
  const { outgoing, incoming, readers, markReaders, rank } = dependencies;
  const owners = new Map<string, string>();
  for (const top of working.drawDefinition.structures ?? []) {
    owners.set(top.structureId, top.structureId);
    for (const child of structuresOf(top) ?? []) owners.set(child.structureId, top.structureId);
  }
  const pending = new Map<string, Trigger>();
  const visited: Visit[] = [];
  const reasons = new Set<string>();
  const ops: OutcomeOp[] = [];
  const affectedMatches = new Set<string>();
  const affectedStructures = new Set<string>();
  const previous = new Map<string, Input[]>();
  const matches = new Map(working.inContextDrawMatchUps.map((m) => [m.matchUpId, m]));
  const ownerOf = (structureId: string) => owners.get(structureId) ?? structureId;
  function inputs(frame: Frame, receiver: HydratedMatchUp) {
    return (incoming.get(receiver.matchUpId) ?? []).map((edge) => {
      const source = matches.get(edge.source)!;
      return { edge, source, grant: readGrant(frame, source, receiver, edge, flags, policies) };
    });
  }
  for (const receiver of matches.values()) previous.set(receiver.matchUpId, inputs(working, receiver));

  function enqueue(id: string, trigger: Trigger) {
    if (trigger === 'assignment' || !pending.has(id)) pending.set(id, trigger);
  }

  function changed(id: string) {
    const error = dependencies.errors.get(id);
    if (error) reasons.add(error);
    for (const edge of outgoing.get(id) ?? []) enqueue(edge.receiver, 'match');
    for (const holder of markReaders.get(id) ?? []) {
      if (!incoming.get(holder)?.some((edge) => edge.source === id)) reasons.add('indirect-origin-relay');
      enqueue(holder, 'match');
    }
  }

  function collectConsumers(batch: OutcomeOp[], idSet: Set<string>, assignmentReaders: Set<string>) {
    for (const op of batch) {
      if ('matchUpId' in op && op.matchUpId) idSet.add(op.matchUpId);
      if (op.op === 'withdrawBye') for (const id of op.clearedWinnerIds ?? []) idSet.add(id);
      if ('structureId' in op && op.structureId) affectedStructures.add(ownerOf(op.structureId));
      if (op.op === 'stampUpdatedAt' && op.entity === 'structure') affectedStructures.add(ownerOf(op.id));
      if (
        'structureId' in op &&
        'drawPosition' in op &&
        ['assignPosition', 'clearPosition', 'assignBye', 'withdrawBye', 'relabelPosition'].includes(op.op)
      ) {
        const key = slotKey(op.structureId, op.drawPosition);
        for (const id of readers.get(key) ?? []) assignmentReaders.add(id);
      }
    }
  }

  function fold(batch: OutcomeOp[], alreadyApplied = false) {
    if (!batch.length) return;
    const idSet = new Set<string>();
    const assignmentReaders = new Set<string>();
    collectConsumers(batch, idSet, assignmentReaders);
    if (!alreadyApplied && working.apply(batch).error) {
      reasons.add('projection-fold');
      return;
    }
    ops.push(...batch);
    for (const id of new Set([...idSet, ...assignmentReaders])) {
      const order = rank.get(id);
      const fresh = order === undefined ? undefined : working.inContextDrawMatchUps[order];
      if (!fresh || fresh.matchUpId !== id) {
        reasons.add('unindexed-holder');
        continue;
      }
      const oldPositions = matches.get(id)?.drawPositions;
      matches.set(id, fresh);
      affectedMatches.add(id);
      affectedStructures.add(ownerOf(fresh.structureId));
      dependencies.indexReaders(fresh);
      for (const receiver of dependencies.eligibilityTargets(fresh, oldPositions)) enqueue(receiver, 'match');
      changed(id);
      if (assignmentReaders.has(id)) enqueue(id, 'assignment');
    }
  }

  function drain(pass: string) {
    // A repeated pending queue with the same relevant readings is a model abstention. Only a
    // production pass's action counter can issue a public bound error/warning.
    const history = new Map<string, Set<string>>();
    while (pending.size) {
      const ordered = [...pending.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!);
      const id = ordered[0];
      const trigger = pending.get(id)!;
      pending.delete(id);
      const target = matches.get(id)!;
      const old = previous.get(id)!;
      const current = inputs(working, target);
      if (trigger !== 'assignment' && old.every((input, i) => sameGrant(input.grant, current[i].grant))) continue;
      const signature = JSON.stringify([
        ordered,
        trigger,
        old.map((i) => i.grant),
        current.map((i) => i.grant),
        target.drawPositions,
        target.winningSide,
        target.matchUpStatus,
        target.sideExitProvenance,
        target.sides?.map((s) => [s.sideNumber, s.drawPosition, s.participantId, s.bye]),
      ]);
      if (history.get(id)?.has(signature)) {
        reasons.add('repeated-unsettled-state');
        return;
      }
      if (!history.has(id)) history.set(id, new Set());
      history.get(id)!.add(signature);
      visited.push({ pass, matchUpId: id, trigger });
      previous.set(id, current);
      const result = reconcileReceiver(working, target, old, current, trigger === 'assignment', release);
      for (const reason of result.reasons) reasons.add(reason);
      fold(result.ops);
    }
  }
  return { fold, drain, reasons, ops, visited, affectedMatches, affectedStructures, ownerOf };
}
