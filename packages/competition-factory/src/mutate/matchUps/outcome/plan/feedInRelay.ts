import { applyTemporalPhases, type TemporalPhases } from '../apply';
import { drawMatchUps, ownState, stampCopies, pendingAnnouncement, withNoticeMarks } from './recordedDiff';
import { DRAW_CHILDREN, MATCHUP_CHILDREN, recordedName, STRUCTURE_CHILDREN } from '../ops';
import { liveNoticeEffects } from '@Mutate/notifications/drawNotifications';
import { getNoticeBuffer, getTopics } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { cloneData, cloneState, restoreState } from '@Tools/cloneState';
import { Recording } from '../recording';

import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import type { BuildViewArgs, OutcomePlan, OutcomeView } from '../types';
import type { MatchUp } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/** The topology is planned before provider clock and stamp getters run. A provider may
 * update its stored tournament in a getter without writing through any notice. Keep the
 * field values and their actual object identities until the recorder's normal clone boundary.
 * Unusual objects and accessors remain with the recorder, without invoking getters here. */
export function watchRelayInputs(args: BuildViewArgs, view: OutcomeView): (() => boolean) | undefined {
  const side = args.request.winningSide;
  if (
    view.drawType !== FEED_IN_CHAMPIONSHIP ||
    (side !== 1 && side !== 2) ||
    view.isTeam ||
    view.existing.winningSide ||
    view.targets.loserMatchUpId ||
    !view.targets.winnerThroughBye?.[side] ||
    !args.writeOnCopy
  )
    return;
  const seen = new Set<object>();
  const nodes: { object: object; keys: (string | symbol)[]; values: unknown[] }[] = [];
  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object') return typeof value !== 'function';
    if (seen.has(value)) return true;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) return false;
    seen.add(value);
    const keys = Reflect.ownKeys(value);
    const values: unknown[] = [];
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !('value' in field) || !visit(field.value)) return false;
      values.push(field.value);
    }
    nodes.push({ object: value, keys, values });
    return true;
  }
  if (![args.request, args.policyDefinitions, args.drawDefinition, args.event, args.tournamentRecord].every(visit))
    return;
  return () =>
    nodes.every(({ object, keys, values }) => {
      const current = Reflect.ownKeys(object);
      return (
        current.length === keys.length &&
        keys.every((key, i) => {
          const field = Object.getOwnPropertyDescriptor(object, key);
          return current[i] === key && field && 'value' in field && Object.is(field.value, values[i]);
        })
      );
    });
}

/** The native score and two placements expose their detached graph at each notice.
 * Commit the five known entities in draw order and re-emit only notices the provider buffered. */
export function feedInRelay(
  args: BuildViewArgs,
  phases: TemporalPhases,
  stamped: Set<string>,
): OutcomePlan | undefined {
  if (!args.drawDefinition || !args.writeOnCopy || !phases.arrival || !phases.onward) return undefined;
  const targets = new Set([phases.result.matchUpId, phases.arrival.matchUpId, phases.onward.matchUpId]);
  const requested = JSON.stringify(args.request);
  const kept = cloneState(args.request);
  const { copy } = cloneState({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    event: args.event,
  });
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
      try {
        const result = write(copy, (copy, map) =>
          applyTemporalPhases({ ...args, ...copy, matchUpsMap: map }, phases, 'direction', {
            notices: liveNoticeEffects,
            // v1 queries subscriptions after writing the draft score. A retained draft
            // from stampCopies is already readable by a passive provider at this call.
            get topics() {
              return getTopics().topics;
            },
          }),
        );
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
      if (!announce) return undefined;
      ops.push(announce);
      return { ops, shape: 'direction', draftClock: true };
    }),
  );
  if (JSON.stringify(args.request) === requested) return program;
  restoreState(kept);
  return undefined;
}
