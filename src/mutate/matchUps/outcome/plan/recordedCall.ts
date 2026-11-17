import { withoutSettleTelemetry } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getCapturedStamps, getNoticeBuffer } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { structuresOf } from '@Helpers/drawTopology/structureMembers';
import { generatePatch } from '@Tools/jsonPatch';
import { cloneState } from '@Tools/cloneState';
import { appendFileSync } from 'node:fs';
import { drawMatchUps, own, recordedNotice, withNoticeMarks } from './recordedCascade';
import { applyOutcomeOps, DRAW_CHILDREN, recordedName, STRUCTURE_CHILDREN, stampedInThisCall } from '../ops';
import { Recording } from '../recording';

// constants and types
import type { DrawDefinition, Structure } from '@Types/tournamentTypes';
import type { BuildViewArgs, OutcomeView, Route } from '../types';
import type { OutcomeOp, RecordedNotice } from '../ops';
import type { ResultType } from '@Types/factoryTypes';

/**
 * SPIKE (batch 3): WHOLE-CALL RECORDING. Where the planners abstain, v1's entire write for the call (`runV1`:
 * `setMatchUpState` and everything under it, exit propagation, `settleAfterWrite`, the edges announcement) runs on a copy
 * of the record, and what it changed in the draw is returned as the recorded ops. Refused wherever the copy's run is
 * not known to be carried whole by those ops.
 */

const TALLY_FILE = process.env.B3_TALLY;
export function b3Tally(...parts: (string | undefined)[]) {
  if (TALLY_FILE) appendFileSync(TALLY_FILE, parts.map((part) => part ?? '-').join(' | ') + '\n');
}

const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, held) =>
    held && typeof held === 'object' && !Array.isArray(held)
      ? Object.fromEntries(Object.entries(held).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : held,
  );

function allStructures(drawDefinition: DrawDefinition): Structure[] {
  const found: Structure[] = [];
  const visit = (structure: Structure) => {
    found.push(structure);
    for (const child of structuresOf(structure) ?? []) visit(child);
  };
  for (const structure of drawDefinition.structures ?? []) visit(structure);
  return found;
}

export type RecordedCall = { ops: OutcomeOp[]; result: ResultType; drawJson?: string };

export function recordWholeCall(
  args: BuildViewArgs,
  view: OutcomeView,
  route: Route | undefined,
  reason: string,
): RecordedCall | undefined {
  const tag = `${route ?? 'none'} | ${reason}`;
  b3Tally('reached', tag);
  const refuse = (cause: string, detail?: string) => {
    b3Tally('refused', tag, cause, detail);
    return undefined;
  };
  const { recordCall, request } = args;
  if (!args.drawDefinition || !recordCall) return refuse('no-record');
  if (process.env.B3_NO_TEAM !== '0' && (view.isTeam || view.line)) return refuse('team');
  const original = args.drawDefinition;
  const stampedBefore = stampedInThisCall(original);
  const liveBefore = process.env.B3_NO_LEAK_CHECK ? '' : JSON.stringify([args.tournamentRecord, original, args.event]);
  const requestBefore = JSON.stringify(request);
  const { copy } = cloneState({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: original,
    event: args.event,
  });
  const { tournamentRecord, event } = copy;
  const drawDefinition = copy.drawDefinition as DrawDefinition;
  const outside = () =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  const ledger = getCapturedStamps();
  if (ledger) {
    if (stampedBefore.has(`drawDefinition:${drawDefinition.drawId}`)) ledger.add(drawDefinition);
    for (const structure of drawDefinition.structures ?? [])
      if (stampedBefore.has(`structure:${structure.structureId}`)) ledger.add(structure);
    for (const matchUp of drawMatchUps(drawDefinition))
      if (stampedBefore.has(`matchUp:${matchUp.matchUpId}`)) ledger.add(matchUp);
  }
  const recorded = withNoticeMarks((readMarks) =>
    withDraftWrites(() =>
      withoutSettleTelemetry(() => {
        const recording = new Recording(drawDefinition);
        const structuresBefore = allStructures(drawDefinition);
        const before = {
          matchUpIds: drawMatchUps(drawDefinition).map((stored) => stored.matchUpId),
          matchUps: new Map(drawMatchUps(drawDefinition).map((stored) => [stored.matchUpId, JSON.stringify(stored)])),
          structures: new Map(
            structuresBefore.map((s) => [s.structureId, JSON.stringify(own(s, STRUCTURE_CHILDREN))]),
          ),
          draw: JSON.stringify(own(drawDefinition, DRAW_CHILDREN)),
          outside: outside(),
          notices: new Set(getNoticeBuffer() ?? []),
        };
        let ran: ReturnType<NonNullable<BuildViewArgs['recordCall']>>;
        try {
          ran = recordCall({ tournamentRecord, drawDefinition, event });
        } catch (error) {
          return refuse('threw', (error as Error)?.message?.slice(0, 80));
        }
        if (ran.refused) return refuse(ran.refused);
        const result = ran.result;
        if (result?.error) return refuse('v1-error', (result.error as { code?: string })?.code);
        if (result?.exhausted) return refuse('settle-exhausted');
        const outsideAfter = outside();
        if (outsideAfter !== before.outside) {
          const paths = generatePatch(JSON.parse(before.outside), JSON.parse(outsideAfter))
            .map((patch) => `${patch.op}:${patch.path.replace(/\/\d+/g, '/*')}`)
            .filter((path, at, all) => all.indexOf(path) === at)
            .slice(0, 6)
            .join(',');
          return refuse('outside-draw', paths);
        }
        const ops: OutcomeOp[] = [];
        const replace = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
          recording.source(recordedName(op), entity);
          ops.push(op);
        };
        const matchUpsAfter = drawMatchUps(drawDefinition);
        if (
          matchUpsAfter.length !== before.matchUpIds.length ||
          matchUpsAfter.some((stored, at) => stored.matchUpId !== before.matchUpIds[at])
        )
          return refuse('matchUps-added-or-moved');
        const structuresAfter = allStructures(drawDefinition);
        if (
          structuresAfter.length !== structuresBefore.length ||
          structuresAfter.some((s, at) => s !== structuresBefore[at])
        )
          return refuse('structures-added-or-moved');
        for (const stored of matchUpsAfter)
          if (JSON.stringify(stored) !== before.matchUps.get(stored.matchUpId))
            replace(
              { op: 'replaceMatchUp', matchUpId: stored.matchUpId, matchUp: structuredClone(stored), recording },
              stored,
            );
        for (const s of structuresAfter) {
          const state = own(s, STRUCTURE_CHILDREN);
          if (JSON.stringify(state) !== before.structures.get(s.structureId))
            replace(
              { op: 'replaceStructureState', structureId: s.structureId, state: structuredClone(state), recording },
              s,
            );
        }
        const state = own(drawDefinition, DRAW_CHILDREN);
        if (JSON.stringify(state) !== before.draw)
          replace(
            { op: 'replaceDrawState', drawId: drawDefinition.drawId, state: structuredClone(state), recording },
            drawDefinition,
          );
        const notices: RecordedNotice[] = [];
        for (const notice of getNoticeBuffer() ?? []) {
          if (before.notices.has(notice)) continue;
          const noticed = recordedNotice(notice);
          if (!noticed) return refuse('notice', notice.topic);
          notices.push(noticed);
        }
        ops.push({ op: 'announceRecorded', notices, marks: readMarks() });
        // the result v1 returned must not hold the copy
        let holds = false;
        const seen = new Set<object>();
        const visit = (value: unknown) => {
          if (!value || typeof value !== 'object' || seen.has(value) || holds) return;
          seen.add(value);
          if (recording.holds(value)) holds = true;
          else for (const held of Object.values(value)) visit(held);
        };
        visit(result);
        if (holds) return refuse('result-holds-record', Object.keys(result ?? {}).join(','));
        // WHOLE OR NOT AT ALL: the ops, folded into a second copy of the draw as it was, leave what v1 left on the first
        const check = cloneState({ drawDefinition: original }).copy.drawDefinition as DrawDefinition;
        const folded = applyOutcomeOps(check, ops, stampedBefore);
        if (folded.error) return refuse('fold-error', folded.error.slice(0, 60));
        if (canonical(check) !== canonical(drawDefinition)) {
          const paths = generatePatch(JSON.parse(canonical(check)), JSON.parse(canonical(drawDefinition)))
            .map((patch) => `${patch.op}:${patch.path.replace(/\/\d+/g, '/*')}`)
            .filter((path, at, all) => all.indexOf(path) === at)
            .slice(0, 4)
            .join(',');
          return refuse('incomplete-diff', paths);
        }
        if (JSON.stringify(check) !== JSON.stringify(drawDefinition)) b3Tally('note', tag, 'value-fold-key-order');
        if (process.env.B3_SABOTAGE) {
          const first = ops.find((op) => op.op === 'replaceMatchUp');
          if (first?.op === 'replaceMatchUp') (first.matchUp as { notes?: string }).notes = 'sabotage';
        }
        return { ops, result, drawJson: JSON.stringify(drawDefinition) };
      }),
    ),
  );
  if (JSON.stringify(request) !== requestBefore) {
    b3Tally('note', tag, 'REQUEST-MUTATED');
    return refuse('request-mutated');
  }
  if (liveBefore && JSON.stringify([args.tournamentRecord, original, args.event]) !== liveBefore) {
    b3Tally('note', tag, 'LEAK-INTO-LIVE-RECORD');
    throw new Error('b3 spike: the recording wrote into the live record');
  }
  if (recorded) b3Tally('recorded', tag, `ops=${recorded.ops.length}`);
  return recorded;
}
