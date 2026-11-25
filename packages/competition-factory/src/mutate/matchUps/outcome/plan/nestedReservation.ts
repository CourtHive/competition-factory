import { buildSideExitProvenance, mergeSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import {
  deferInContextMatchUp,
  deferredQuery,
  modifyMatchUpNotice,
  modifyPositionAssignmentsNotice,
} from '@Mutate/notifications/drawNotifications';
import { getInContextMatchUp } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { getNoticeBuffer, getTopics } from '@Global/state/globalState';
import { withDraftWrites } from '@Global/state/withDraftWrites';
import {
  CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_MATCHUP,
  LOSER,
  MAIN,
  TOP_DOWN,
} from '@Constants/drawDefinitionConstants';
import {
  BYE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { cloneData, cloneState } from '@Tools/cloneState';
import {
  applyOutcomeOps,
  DRAW_CHILDREN,
  MATCHUP_CHILDREN,
  recordedName,
  stampedInThisCall,
  STRUCTURE_CHILDREN,
} from '../ops';
import { ownState, pendingAnnouncement, stampCopies, withNoticeMarks } from './recordedDiff';
import { Recording } from '../recording';

import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import type { BuildViewArgs, OutcomeView, RecordCopy } from '../types';
import type { OutcomeOp } from '../ops';

function open(match?: MatchUp) {
  return (
    match?.matchUpStatus === TO_BE_PLAYED &&
    !match.winningSide &&
    !match.score &&
    !match.matchUpStatusCodes &&
    !match.sideExitProvenance &&
    !match.schedule &&
    !match.tieMatchUps
  );
}

/** The main target's unfillable loser seat must meet the loser target's winner at the same crossing. */
function reservation(draw: DrawDefinition, view: OutcomeView, id: string) {
  const { targets } = view;
  const seat = targets.winnerLoserSeat;
  if (
    !seat?.seat?.free ||
    seat.linkCondition !== FIRST_MATCHUP ||
    !targets.loserTargetSeat?.free ||
    targets.loserTargetSeat.opponentHeld ||
    draw.structures?.length !== 2
  )
    return;
  const main = draw.structures.find((s) => s.structureId === targets.source.structureId && s.stage === MAIN);
  const consolation = draw.structures.find((s) => s.structureId === seat.structureId && s.stage === CONSOLATION);
  if (!main || !consolation || consolation.structureId !== targets.loserStructureId) return;
  const links = draw.links;
  if (
    links?.length !== 2 ||
    ![1, 2].every((round) =>
      links.some(
        (link) =>
          link.linkType === LOSER &&
          link.source?.structureId === main.structureId &&
          link.source.roundNumber === round &&
          link.target?.structureId === consolation.structureId &&
          link.target.roundNumber === round &&
          link.target.feedProfile === TOP_DOWN &&
          link.linkCondition === (round === 2 ? FIRST_MATCHUP : undefined),
      ),
    )
  )
    return;
  const mainMatches = matchUpsOf(main) ?? [];
  const matches = matchUpsOf(consolation) ?? [];
  const source = mainMatches.find((m) => m.matchUpId === id);
  const pending = mainMatches.find((m) => m.matchUpId === source?.winnerMatchUpId);
  const loser = matches.find((m) => m.matchUpId === source?.loserMatchUpId);
  const crossing = matches.find((m) => m.matchUpId === seat.matchUpId);
  const onward = matches.find((m) => m.matchUpId === crossing?.winnerMatchUpId);
  if (
    !source ||
    !pending ||
    !loser ||
    !crossing ||
    !onward ||
    !open(source) ||
    !open(pending) ||
    !open(loser) ||
    !open(crossing)
  )
    return;
  const paired = mainMatches.find((m) => m !== source && m.winnerMatchUpId === pending.matchUpId);
  if (
    !open(paired) ||
    paired?.loserMatchUpId !== loser.matchUpId ||
    loser.roundNumber !== 1 ||
    pending.roundNumber !== 2 ||
    crossing.roundNumber !== 2 ||
    onward.roundNumber !== 3 ||
    source.roundNumber !== 1 ||
    !source.roundPosition ||
    source.roundPosition % 2 ||
    pending.loserMatchUpId !== crossing.matchUpId ||
    loser.winnerMatchUpId !== crossing.matchUpId ||
    loser.loserMatchUpId ||
    crossing.loserMatchUpId ||
    !crossing.roundPosition ||
    crossing.roundPosition % 2 ||
    pending.drawPositions?.length !== 0 ||
    loser.drawPositions?.length !== 2 ||
    crossing.drawPositions?.length !== 1 ||
    crossing.drawPositions[0] !== seat.drawPosition ||
    loser.drawPositions[1] !== targets.loserTargetDrawPosition ||
    onward.drawPositions?.length !== 0 ||
    onward.winningSide ||
    onward.matchUpStatus !== WALKOVER
  )
    return;
  const origin = onward.sideExitProvenance?.[1];
  const previous = matches.find((m) => m.matchUpId === origin?.sourceMatchUpId);
  const otherFeeder = matches.find((m) => m.matchUpId === previous?.winnerMatchUpId);
  if (
    origin?.previousMatchUpStatus !== DOUBLE_WALKOVER ||
    origin.matchUpStatus !== WALKOVER ||
    onward.sideExitProvenance?.[2] ||
    previous?.matchUpStatus !== DOUBLE_WALKOVER ||
    otherFeeder?.matchUpStatus !== BYE ||
    otherFeeder.winnerMatchUpId !== onward.matchUpId
  )
    return;
  const advancing = loser.drawPositions[0];
  const assignments = positionAssignmentsOf(consolation) ?? [];
  const assignment = assignments.find((a) => a.drawPosition === seat.drawPosition);
  if (
    !advancing ||
    advancing <= seat.drawPosition ||
    !assignment ||
    ![seat.drawPosition, ...loser.drawPositions].every((dp) =>
      assignments.some((a) => a.drawPosition === dp && Object.keys(a).length === 1),
    )
  )
    return;
  return { source, pending, loser, crossing, onward, main, consolation, assignment, advancing };
}

type Reservation = NonNullable<ReturnType<typeof reservation>>;

function applyReservation(copy: RecordCopy, r: Reservation) {
  const { drawDefinition, tournamentRecord, event } = copy;
  const tournamentId = tournamentRecord?.tournamentId;
  const scoreExit = (matchUp: MatchUp, awarded: boolean) => {
    matchUp.matchUpStatus = DEFAULTED;
    delete matchUp.orderOfFinish;
    matchUp.matchUpStatusCodes = [];
    delete matchUp.matchUpStatusCode;
    delete matchUp.sideStatusCodes;
    if (awarded) matchUp.winningSide = 1;
    // Score subscribers see the result before provenance is merged into the target.
    const matchUpId = matchUp.matchUpId;
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
    mergeSideExitProvenance({
      matchUp,
      provenance: buildSideExitProvenance({
        sourceMatchUpId: r.source.matchUpId,
        sourceMatchUpStatus: DOUBLE_DEFAULT,
        sourceSideNumber: 2,
      }),
    });
  };
  scoreExit(r.loser, true);
  r.crossing.drawPositions = [r.assignment.drawPosition, r.advancing];
  r.crossing.winningSide = undefined;
  // The placement is entered from the loser-side award without a tournament context.
  modifyMatchUpNotice({ drawDefinition, matchUp: r.crossing, context: 'assignMatchUpDrawPosition' });
  r.assignment.bye = true;
  r.assignment.participantId = undefined; // Propagation explicitly clears this own field, even on a vacant seat.
  r.assignment.byeFromPropagation = true;
  r.crossing.matchUpStatus = BYE;
  r.crossing.score = undefined;
  modifyMatchUpNotice({ tournamentId, drawDefinition, matchUp: r.crossing, context: 'setMatchUpStatusBye' });
  r.onward.drawPositions = [r.advancing];
  modifyMatchUpNotice({ tournamentId, drawDefinition, matchUp: r.onward, context: 'advanceWinner' });
  modifyPositionAssignmentsNotice({ tournamentId, drawDefinition, structure: r.consolation, event: undefined });
  scoreExit(r.pending, false);
}

function ownFields(entity: object, children: string[]) {
  return cloneData(ownState(entity, children));
}

export function nestedReservationSuffix(args: BuildViewArgs, view: OutcomeView, prefix: OutcomeOp[]) {
  const draw = args.drawDefinition,
    id = args.request.matchUpId;
  if (
    !draw ||
    !id ||
    draw.drawType !== FIRST_MATCH_LOSER_CONSOLATION ||
    args.request.matchUpStatus !== DOUBLE_DEFAULT ||
    args.request.flags.propagateExitStatus !== false ||
    view.draw.propagatesByeOnDoubleExit ||
    view.draw.defaultProcessCodes ||
    view.draw.perMatchUpCompetition ||
    !view.draw.storesEdges ||
    prefix.length !== 4 ||
    prefix[0].op !== 'setMatchUpResult' ||
    !prefix.slice(1).every((op) => op.op === 'stampUpdatedAt')
  )
    return;
  const seats = reservation(draw, view, id);
  if (!seats) return;
  return () =>
    args.recordDraws?.(() => {
      const stamped = stampedInThisCall(draw);
      const { copy } = cloneState({
        tournamentRecord: args.tournamentRecord,
        drawDefinition: draw,
        event: args.event,
        seats,
      });
      stampCopies(copy.drawDefinition, stamped);
      return withNoticeMarks((readMarks) =>
        withDraftWrites(() => {
          const r = copy.seats;
          if (applyOutcomeOps(copy.drawDefinition, prefix, stamped).error) return;
          const drawStamp = copy.drawDefinition.updatedAt,
            mainStamp = r.main.updatedAt;
          // Bind the detached entities to their live counterparts, including retained assignment and score references.
          const recording = new Recording(copy.drawDefinition);
          const before = new Set(getNoticeBuffer() ?? []);
          applyReservation(copy, r);
          const ops: OutcomeOp[] = [];
          for (const matchUp of [r.pending, r.loser, r.crossing, r.onward]) {
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
            if (structure !== r.consolation && (structure !== r.main || structure.updatedAt === mainStamp)) continue;
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
