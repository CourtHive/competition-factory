import { deferInContextMatchUp, deferredQuery, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { hasStaleScoredTime } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { firstDoubleExitEntry, recordPreparedCascade } from './recordedCascade';
import { buildOutcomeView } from '../view';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getNoticeBuffer, getTopics } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { cloneData, cloneState } from '@Tools/cloneState';
import {
  applyOutcomeOps,
  DRAW_CHILDREN,
  MATCHUP_CHILDREN,
  STRUCTURE_CHILDREN,
  recordedName,
  stampedInThisCall,
} from '../ops';
import { ownState, pendingAnnouncement, stampCopies, withNoticeMarks } from './recordedDiff';
import { Recording } from '../recording';
import type { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';
import type { BuildViewArgs, OutcomeView, RecordCopy } from '../types';
import type { OutcomeOp } from '../ops';

export function announceNestedScore({ drawDefinition, tournamentRecord, event }: RecordCopy, matchUp: MatchUp) {
  const tournamentId = tournamentRecord?.tournamentId,
    matchUpId = matchUp.matchUpId;
  if (getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP))
    deferInContextMatchUp({
      inContextMatchUp: deferredQuery(getInContextMatchUp, { tournamentRecord, drawDefinition, matchUpId }),
      tournamentId,
      matchUpId,
    });
  modifyMatchUpNotice({
    tournamentId,
    eventId: event?.eventId,
    event,
    drawDefinition,
    matchUp,
    context: 'modifyMatchUpScore',
  });
}

export function openNestedTarget(match?: MatchUp) {
  return (
    match?.matchUpStatus === TO_BE_PLAYED &&
    !match.winningSide &&
    !match.score &&
    !match.matchUpStatusCodes &&
    !match.sideStatusCodes &&
    !match.matchUpStatusCode &&
    !match.sideExitProvenance &&
    !match.schedule &&
    !match.tieMatchUps
  );
}

export function plainNestedPrefix({ request }: BuildViewArgs, view: OutcomeView, prefix: OutcomeOp[]) {
  return (
    !request.score &&
    !request.winningSide &&
    !request.matchUpStatusCodes &&
    !request.matchUpFormat &&
    !request.carries?.notes &&
    !request.carries?.schedule &&
    !view.draw.propagatesByeOnDoubleExit &&
    !view.draw.defaultProcessCodes &&
    !view.draw.perMatchUpCompetition &&
    view.draw.storesEdges &&
    prefix.length === 4 &&
    prefix[0].op === 'setMatchUpResult' &&
    prefix.slice(1).every((op) => op.op === 'stampUpdatedAt')
  );
}

function ownFields(entity: object, children: string[]) {
  return cloneData(ownState(entity, children));
}

/** Run the admitted downstream write on the detached record with its original prefix and provider scope. */
export function nestedDraft<T>(
  args: BuildViewArgs,
  draw: DrawDefinition,
  prefix: OutcomeOp[],
  certify: (draw: DrawDefinition, view: OutcomeView) => T | undefined,
  apply: (copy: RecordCopy, seats: T) => { matches: MatchUp[]; assignments?: Structure },
) {
  return () =>
    args.recordDraws?.(() => {
      const request = args.request,
        matchUpId = request.matchUpId as string;
      if (!firstDoubleExitEntry(args, matchUpId)) return;
      const stamped = stampedInThisCall(draw);
      const { copy } = cloneState({
        tournamentRecord: args.tournamentRecord,
        drawDefinition: draw,
        event: args.event,
      });
      const matchUpsMap = getMatchUpsMap({ drawDefinition: copy.drawDefinition });
      const fresh = { ...args, ...copy, matchUpsMap, inContextDrawMatchUps: undefined, structural: undefined };
      // An installed provider may have changed its borrowed tournament during the stamp read.
      // Certify the actual copy once and keep it for either writer. Off-path time cleanup emits its own draft notices.
      const resume = () => recordPreparedCascade(args, prefix, copy, stamped, request, matchUpId);
      if (matchUpsMap.drawMatchUps.some(hasStaleScoredTime)) return resume();
      const view = buildOutcomeView(fresh);
      const r = plainNestedPrefix(fresh, view, prefix) && certify(copy.drawDefinition, view);
      if (!r) return resume();
      stampCopies(copy.drawDefinition, stamped);
      return withNoticeMarks((readMarks) =>
        withDraftWrites(() => {
          if (applyOutcomeOps(copy.drawDefinition, prefix, stamped).error) return;
          const drawStamp = copy.drawDefinition.updatedAt;
          const beforeStamps = new Map(
            copy.drawDefinition.structures?.map((structure) => [structure, structure.updatedAt]),
          );
          // Bind the detached entities to their live counterparts, including retained assignment and score references.
          const recording = new Recording(copy.drawDefinition);
          const before = new Set(getNoticeBuffer() ?? []);
          const written = apply(copy, r);
          const ops: OutcomeOp[] = [];
          const touched = new Set(written.matches);
          const ordered = (copy.drawDefinition.structures ?? []).flatMap((s) =>
            (matchUpsOf(s) ?? []).filter((m) => touched.has(m)),
          );
          for (const matchUp of ordered) {
            const op = {
              op: 'replaceMatchUp' as const,
              matchUpId: matchUp.matchUpId,
              matchUp: ownFields(matchUp, MATCHUP_CHILDREN) as MatchUp,
              recording,
            };
            recording.source(recordedName(op), matchUp);
            ops.push(op);
          }
          for (const structure of copy.drawDefinition.structures ?? []) {
            if (structure !== written.assignments && structure.updatedAt === beforeStamps.get(structure)) continue;
            const op = {
              op: 'replaceStructureState' as const,
              structureId: structure.structureId,
              state: ownFields(structure, STRUCTURE_CHILDREN),
              recording,
            };
            recording.source(recordedName(op), structure);
            ops.push(op);
          }
          if (copy.drawDefinition.updatedAt !== drawStamp) {
            const op = {
              op: 'replaceDrawState' as const,
              drawId: copy.drawDefinition.drawId,
              state: ownFields(copy.drawDefinition, DRAW_CHILDREN),
              recording,
            };
            recording.source(recordedName(op), copy.drawDefinition);
            ops.push(op);
          }
          const announce = pendingAnnouncement(before, readMarks());
          return announce && [...ops, announce];
        }),
      );
    });
}
