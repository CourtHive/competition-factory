import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { cloneState } from '@Tools/cloneState';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { readBefore, recordedOps, stampCopies, withNoticeMarks } from './recordedDiff';
import { applyForwardByePassage } from '../apply';
import { stampedInThisCall } from '../ops';
import { Recording } from '../recording';
import type { BuildViewArgs, ForwardByePhases } from '../types';

/** The placement proof fixes the writes. Providers observe them on a detached graph, then receive the
 * buffered notices on the stored graph. The installed provider determines coalescing and mark order. */
export function projectByePassage(args: BuildViewArgs, phases: ForwardByePhases) {
  if (!args.drawDefinition) return undefined;
  const priorStamps = stampedInThisCall(args.drawDefinition);
  const { copy } = cloneState({
    drawDefinition: args.drawDefinition,
    event: args.event,
    tournamentRecord: args.tournamentRecord,
  });
  const { drawDefinition } = copy;
  stampCopies(drawDefinition, priorStamps);
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
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
  return withNoticeMarks((readMarks) =>
    withDraftWrites(() => {
      const recording = new Recording(drawDefinition);
      const before = readBefore(drawDefinition, entities);
      const answer = args.recordDraws?.(() => {
        const records = Object.keys(args.callRecords ?? {});
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
}
