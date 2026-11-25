import { withDraftWrites } from '@Global/state/withDraftWrites';
import { restoreState } from '@Tools/cloneState';
import type { prepareRecordedCopy } from './recordedCall';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { applyForwardByePassage } from '../apply';
import { Recording } from '../recording';
import type { BuildViewArgs, ForwardByePhases } from '../types';

/** The placement proof fixes the writes. Providers observe them on a detached graph, then receive the
 * buffered notices on the stored graph. The installed provider determines coalescing and mark order. */
export function projectByePassage(
  args: BuildViewArgs,
  phases: ForwardByePhases,
  priorStamps: Set<string>,
  prepared: ReturnType<typeof prepareRecordedCopy>,
) {
  const { copy, kept, requested } = prepared;
  const { drawDefinition } = copy;
  const matchUpsMap = args.matchUpsMap!;
  const recording = new Recording(drawDefinition);
  const visited = new Set<object>();
  const outside = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || value === drawDefinition || visited.has(value)) return false;
    if (recording.contains(value)) return true;
    visited.add(value);
    return Object.values(value).some(outside);
  };
  const sourceSchedule = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === phases.result.matchUpId)?.schedule;
  if (
    outside(copy.tournamentRecord) ||
    outside(copy.event) ||
    (sourceSchedule &&
      matchUpsMap.drawMatchUps.some((m) => m.matchUpId !== phases.result.matchUpId && m.schedule === sourceSchedule))
  ) {
    return undefined;
  }
  stampCopies(drawDefinition, priorStamps);
  const ids = new Set([
    phases.result.matchUpId,
    ...phases.winner.map((p) => p.matchUpId),
    ...(phases.loser?.placements ?? []).map((p) => p.matchUpId),
  ]);
  const entities = {
    matchUps: matchUpsMap.drawMatchUps.filter((m) => ids.has(m.matchUpId)),
    structures: (drawDefinition.structures ?? []).filter(
      (s) => s.structureId === phases.loser?.assignment.structureId || matchUpsOf(s)?.some((m) => ids.has(m.matchUpId)),
    ),
  };
  const program = withNoticeMarks((readMarks) =>
    withDraftWrites(() => {
      const before = readBefore(drawDefinition, entities);
      const answer = args.recordDraws?.(() => {
        const records = Object.keys(args.tournamentRecords ?? {});
        if (records.length > 1 || (records.length && records[0] !== copy.tournamentRecord?.tournamentId))
          return undefined;
        // As for writeOnCopy, an exception belongs to the writer on the stored record after rollback.
        try {
          return applyForwardByePassage({ ...args, ...copy, matchUpsMap }, phases);
        } catch {
          return undefined;
        }
      });
      if (!answer || answer.error) return undefined;
      return recordedOps({ drawDefinition, recording, before, entities, marks: readMarks() });
    }),
  );
  if (JSON.stringify(args.request) === requested) return { ops: program };
  restoreState(kept);
  return { ops: undefined };
}
