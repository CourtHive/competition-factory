import { announcesAssignments, eventlessNotices } from '@Mutate/matchUps/outcome/apply';
import { splitScoredTimeCleanup } from '@Mutate/matchUps/outcome/ops';

// constants and types
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

const RECORDED_OPS = new Set(['replaceMatchUp', 'replaceStructureState', 'replaceDrawState', 'announceRecorded']);

/** a notice whose payload names no event, marked on its key where the event is compared (`plannedNotices`) */
export const NO_EVENT = '|no-event';
export const EVENT_COMPARED = new Set<string>([MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS]);

/**
 * TEST-ONLY. THE NOTICES a complete plan implies, by topic and key (executor plan § 3.5.5): the deduplicated buffer v1 leaves,
 * which a client's sync reads. Measured 2026-10-24 with every topic subscribed: a matchUp written or stamped is a
 * `modifyMatchUp`, the call's own matchUp an `updateInContextMatchUp`, the draw a `modifyDrawDefinition`, and a structure
 * an `assignPosition` or `assignBye` writes a `modifyPositionAssignments` keyed by structureId.
 *
 * Of the payloads, whether a `modifyMatchUp` or a `modifyPositionAssignments` names the event (S7): a key whose notice
 * names none is marked `NO_EVENT`, by the rules `applyOwnedPlan` writes it with (`eventlessNotices`). A call with no
 * event marks every event-compared notice as eventless, without inventing context.
 */
export function plannedNotices({
  ops,
  matchUpId,
  hasEvent = true,
  prior,
}: {
  ops: OutcomeOp[];
  matchUpId: string;
  hasEvent?: boolean;
  prior?: { topic?: string; key?: string; payload?: { eventId?: string } }[];
}): Set<string> {
  // A satisfied double exit has an empty plan: v1 writes and announces nothing.
  if (!ops.length) return new Set();
  const { prefix, cleanup } = splitScoredTimeCleanup(ops);
  const eventless = eventlessNotices(prefix);
  for (const { matchUpId } of cleanup) eventless.matchUps.delete(matchUpId);
  // `preserveNoticeIdentity` keeps an earlier buffered event when this write supplies none.
  const retainedEvents = new Set(
    prior?.filter((notice) => notice.payload?.eventId).map((notice) => `${notice.topic}|${notice.key}`),
  );
  // ...and within the call: a matchUp a named release announced (`releaseAdvancedDrawPosition`, with the event) keeps that
  // event when a later quiet write announces it again (1c: a held carry's landing the converged matchUp was released from)
  for (const op of ops)
    if (op.op === 'setMatchUpDrawPositions' && op.releasedDrawPosition && op.announcesContext !== false)
      retainedEvents.add(`${MODIFY_MATCHUP}|${op.matchUpId}`);
  const marked = (topic: string, key: string, unevented: boolean) => {
    const identity = `${topic}|${key}`;
    return `${identity}${(!hasEvent || unevented) && !retainedEvents.has(identity) ? NO_EVENT : ''}`;
  };
  // a call recorded whole announces what it recorded, and nothing besides (`plan/recordedCall.ts`)
  const recordedWhole = prefix.every((op) => RECORDED_OPS.has(op.op));
  const scheduleOnly = prefix.every((op) => op.op === 'setMatchUpSchedule');
  const notices = new Set<string>(!recordedWhole && !scheduleOnly ? [`${UPDATE_INCONTEXT_MATCHUP}|${matchUpId}`] : []);
  for (const op of ops) {
    // every score write announces its matchUp in context, as `apply.ts` defers it: a TEAM line's dual too (S7)
    if (op.op === 'setMatchUpResult' && !op.announcedAs) notices.add(`${UPDATE_INCONTEXT_MATCHUP}|${op.matchUpId}`);
    // a placement, and a seat an unwind visits (`withdrawBye`): `apply.ts` announces each structure's assignments
    if (announcesAssignments(op))
      notices.add(marked(MODIFY_POSITION_ASSIGNMENTS, op.structureId, eventless.structures.has(op.structureId)));
    if (op.op === 'announceRecorded')
      for (const { topic, key, eventId } of op.notices) {
        const identity = `${topic}|${key}`;
        const compared = EVENT_COMPARED.has(topic);
        if (!compared || eventId || retainedEvents.has(identity)) {
          notices.delete(`${identity}${NO_EVENT}`);
          notices.add(identity);
        } else if (!notices.has(identity)) notices.add(`${identity}${NO_EVENT}`);
      }
    if (op.op !== 'stampUpdatedAt') continue;
    if (op.entity === 'matchUp') notices.add(marked(MODIFY_MATCHUP, op.id, eventless.matchUps.has(op.id)));
    if (op.entity === 'drawDefinition') notices.add(`${MODIFY_DRAW_DEFINITION}|${op.id}`);
  }
  return notices;
}
