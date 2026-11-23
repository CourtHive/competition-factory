import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { findStructure } from '@Acquire/findStructure';
import { nextStamp, type OutcomeOp } from '../ops';
import type { WorkingView } from '../overlay';
import type { MatchUpsMap } from '@Types/factoryTypes';

/** Finish once all folds have completed: sharing input objects earlier could expose them to a
 * subsequent position exchange. The score writer assigns its fixture on reset and otherwise
 * assigns the input score. Unrelated stamps must preserve aliases on unmodified score records. */
export function bindResultAliases(working: WorkingView, before: MatchUpsMap, ops: OutcomeOp[]) {
  const originals = new Map(before.drawMatchUps.map((m) => [m.matchUpId, m]));
  const byId = groupMatchWrites(ops);
  for (const m of working.matchUpsMap.drawMatchUps) {
    const original = originals.get(m.matchUpId);
    if (!original || original === m) continue;
    let score = original.score;
    let codes = original.matchUpStatusCodes;
    for (const op of byId.get(m.matchUpId) ?? []) {
      switch (op.op) {
        case 'setMatchUpResult':
          if (op.resetsScore) score = toBePlayed.score;
          else if (op.score) score = op.score;
          if (op.matchUpStatusCodes) codes = op.matchUpStatusCodes;
          else if (op.resetsScore) codes = toBePlayed.matchUpStatusCodes;
          if (op.withdrawsCarry) codes = undefined;
          break;
        case 'clearMatchUpScoredTime':
        case 'setSideExitProvenance':
        case 'mergeSideExitProvenance':
          break;
        default:
          score = undefined;
          codes = undefined;
      }
    }
    if (m.score && score) m.score = score;
    if (m.matchUpStatusCodes && codes) m.matchUpStatusCodes = codes;
  }
}

export function materializeClock(working: WorkingView, instant: number, prior: Set<string>) {
  const now = new Date(instant).toISOString();
  const matches = new Map(working.matchUpsMap.drawMatchUps.map((m) => [m.matchUpId, m]));
  for (const id of working.temporal?.scoredTimes ?? []) {
    const match = matches.get(id);
    if (match?.schedule) match.schedule.scoredTime = now;
  }
  for (const key of working.temporal?.updatedAt ?? []) {
    if (prior.has(key)) continue;
    const split = key.indexOf(':');
    const entity = key.slice(0, split);
    const id = key.slice(split + 1);
    let target;
    if (entity === 'drawDefinition') target = working.drawDefinition;
    else if (entity === 'matchUp') target = matches.get(id);
    else target = findStructure({ drawDefinition: working.drawDefinition, structureId: id }).structure;
    if (target) target.updatedAt = nextStamp(target.updatedAt, now);
  }
}

function groupMatchWrites(ops: OutcomeOp[]) {
  const byId = new Map<string, OutcomeOp[]>();
  for (const op of ops) {
    if (!('matchUpId' in op) || !op.matchUpId) continue;
    const writes = byId.get(op.matchUpId) ?? [];
    writes.push(op);
    byId.set(op.matchUpId, writes);
  }
  return byId;
}
