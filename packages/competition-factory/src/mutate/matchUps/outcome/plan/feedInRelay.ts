import { applyTemporalPhases, type TemporalPhases } from '../apply';
import { drawMatchUps, ownState, stampCopies, pendingAnnouncement, withNoticeMarks } from './recordedDiff';
import { DRAW_CHILDREN, MATCHUP_CHILDREN, recordedName, STRUCTURE_CHILDREN } from '../ops';
import { liveNoticeEffects } from '@Mutate/notifications/drawNotifications';
import { getNoticeBuffer, getTopics } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { cloneData, restoreState } from '@Tools/cloneState';
import { Recording } from '../recording';

import { returnedOnStored, type prepareRecordedCopy } from './recordedCall';
import type { BuildViewArgs, OutcomePlan, RecordCopy } from '../types';
import type { MatchUp } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';
import type { MatchUpsMap } from '@Types/factoryTypes';

/** A reference to a mutated match or its schedule through the event or another
 * tournament field makes this an outside-draw write to the whole recorder.
 * Follow references on the existing clone, skipping ordinary draw containment. */
export function outsideRelayReference(copy: RecordCopy, map: MatchUpsMap, phases: TemporalPhases): boolean {
  const ids = new Set([phases.result.matchUpId, phases.arrival?.matchUpId, phases.onward?.matchUpId]);
  const mutable = new Set<object>();
  const group = copy.drawDefinition.structures?.find((s) => s.structureId === phases.sourceStructureId);
  if (group) mutable.add(group);
  for (const item of map.drawMatchUps) {
    if (ids.has(item.matchUpId)) mutable.add(item);
  }
  const source = map.drawMatchUps.find((m) => m.matchUpId === phases.result.matchUpId);
  if (source?.schedule) {
    mutable.add(source.schedule);
    if (map.drawMatchUps.some((m) => m !== source && m.schedule === source.schedule)) return true;
  }
  const seen = new Set<object>();
  function retained(value: unknown): boolean {
    if (!value || typeof value !== 'object' || value === copy.drawDefinition || seen.has(value)) return false;
    if (mutable.has(value)) return true;
    seen.add(value);
    return Object.values(value).some(retained);
  }
  return retained(copy.tournamentRecord) || retained(copy.event);
}

/** The native score and two placements expose their detached graph at each notice.
 * Commit the five known entities in draw order and re-emit only notices the provider buffered. */
export function feedInRelay(
  args: BuildViewArgs,
  phases: TemporalPhases,
  stamped: Set<string>,
  prepared: ReturnType<typeof prepareRecordedCopy>,
): OutcomePlan | undefined {
  const finish = args.finishOnCopy;
  if (!finish || !args.drawDefinition || !args.writeOnCopy || !phases.arrival || !phases.onward) return undefined;
  const targets = new Set([phases.result.matchUpId, phases.arrival.matchUpId, phases.onward.matchUpId]);
  const { requested, kept, copy } = prepared;
  const draw = copy.drawDefinition;
  stampCopies(draw, stamped);
  const write = args.writeOnCopy;
  const program = withNoticeMarks((readMarks): OutcomePlan | undefined =>
    withDraftWrites(() => {
      const structure = draw.structures?.find((s) => s.structureId === phases.sourceStructureId);
      if (!structure) return undefined;
      const beforeDraw = draw.updatedAt;
      const beforeStructure = structure.updatedAt;
      const recording = new Recording(draw);
      const prior = new Set(getNoticeBuffer() ?? []);
      // An invalid or throwing source is replayed by the ordinary fallback at the same read.
      let result;
      try {
        result = write(copy, (copy, map) => {
          const written = applyTemporalPhases({ ...args, ...copy, matchUpsMap: map }, phases, 'direction', {
            notices: liveNoticeEffects,
            // v1 queries subscriptions after writing the draft score. A retained draft
            // from stampCopies is already readable by a passive provider at this call.
            get topics() {
              return getTopics().topics;
            },
          });
          return finish(copy, map, written);
        });
        if (!result || result.error) return undefined;
      } catch {
        return undefined;
      }
      const ops: OutcomeOp[] = [];
      const replace = (op: Extract<OutcomeOp, { recording?: Recording }>, entity: object) => {
        recording.source(recordedName(op), entity);
        ops.push(op);
      };
      for (const m of drawMatchUps(draw))
        if (targets.has(m.matchUpId))
          replace(
            {
              op: 'replaceMatchUp',
              matchUpId: m.matchUpId,
              matchUp: cloneData(ownState(m, MATCHUP_CHILDREN)) as MatchUp,
              recording,
            },
            m,
          );
      // Stamped entities can already hold their instant. A passive draft does not
      // replace those entities on the stored draw unless it actually changed them.
      if (structure.updatedAt !== beforeStructure)
        replace(
          {
            op: 'replaceStructureState',
            structureId: structure.structureId,
            state: cloneData(ownState(structure, STRUCTURE_CHILDREN)),
            recording,
          },
          structure,
        );
      if (draw.updatedAt !== beforeDraw)
        replace(
          { op: 'replaceDrawState', drawId: draw.drawId, state: cloneData(ownState(draw, DRAW_CHILDREN)), recording },
          draw,
        );
      const announce = pendingAnnouncement(prior, readMarks());
      if (!announce || !returnedOnStored(result, prepared.originals, draw)) return undefined;
      ops.push(announce);
      return { ops, shape: 'direction', draftClock: true, phaseResult: result };
    }),
  );
  if (JSON.stringify(args.request) === requested) return program;
  restoreState(kept);
  return undefined;
}
