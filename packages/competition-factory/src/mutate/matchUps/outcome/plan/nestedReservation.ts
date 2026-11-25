import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { buildSideExitProvenance, mergeSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { modifyMatchUpNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
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
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { announceNestedScore, nestedDraft, openNestedTarget, plainNestedPrefix } from './nestedDraft';

import type { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import type { BuildViewArgs, OutcomeView, RecordCopy } from '../types';
import type { OutcomeOp } from '../ops';

/** The main target's unfillable loser seat must meet the loser target's winner at the same crossing. */
function reservation(draw: DrawDefinition, view: OutcomeView, id: string, occupied: boolean) {
  const { targets } = view;
  const seat = targets.winnerLoserSeat;
  if (
    !seat?.seat?.free ||
    seat.linkCondition !== FIRST_MATCHUP ||
    !targets.loserTargetSeat?.free ||
    targets.loserTargetSeat.opponentHeld !== occupied ||
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
    !openNestedTarget(source) ||
    !openNestedTarget(pending) ||
    !openNestedTarget(loser) ||
    !openNestedTarget(crossing)
  )
    return;
  const advancing = getSideDrawPosition({
    drawDefinition: draw,
    structureId: consolation.structureId,
    matchUp: loser,
    sideNumber: 1,
  });
  const fed = getSideDrawPosition({
    drawDefinition: draw,
    structureId: consolation.structureId,
    matchUp: loser,
    sideNumber: 2,
  });
  const paired = mainMatches.find((m) => m !== source && m.winnerMatchUpId === pending.matchUpId);
  if (
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
    loser.drawPositions?.length !== 2 ||
    crossing.drawPositions?.length !== 1 ||
    !crossing.drawPositions.includes(seat.drawPosition) ||
    !fed ||
    fed !== targets.loserTargetDrawPosition ||
    onward.winningSide ||
    onward.sideExitProvenance?.[2]
  )
    return;
  const origin = onward.sideExitProvenance?.[1];
  const assignments = positionAssignmentsOf(consolation) ?? [];
  const at = (dp: number) => assignments.find((a) => a.drawPosition === dp);
  const vacant = (dp: number) => {
    const a = at(dp);
    return a && Object.keys(a).length === 1;
  };
  const assignment = at(seat.drawPosition);
  if (!assignment || !advancing || advancing <= seat.drawPosition || !vacant(seat.drawPosition) || !vacant(fed)) return;
  const shared = { source, pending, loser, crossing, onward, consolation, assignment, advancing };
  if (!occupied) {
    const previous = matches.find((m) => m.matchUpId === origin?.sourceMatchUpId);
    const feeder = matches.find((m) => m.matchUpId === previous?.winnerMatchUpId);
    if (
      !openNestedTarget(paired) ||
      !vacant(advancing) ||
      pending.drawPositions?.length !== 0 ||
      onward.drawPositions?.length !== 0 ||
      onward.matchUpStatus !== WALKOVER ||
      origin?.previousMatchUpStatus !== DOUBLE_WALKOVER ||
      origin.matchUpStatus !== WALKOVER ||
      previous?.matchUpStatus !== DOUBLE_WALKOVER ||
      feeder?.matchUpStatus !== BYE ||
      feeder.winnerMatchUpId !== onward.matchUpId
    )
      return;
    return { ...shared, arrivals: undefined };
  }
  // Both losers reached their linked structure. The participant goes past the crossing and wins the pending default.
  const previous = mainMatches.find((m) => m.matchUpId === origin?.sourceMatchUpId);
  const first = matches.find((m) => m.matchUpId === previous?.loserMatchUpId);
  const feeder = matches.find((m) => m.matchUpId === first?.winnerMatchUpId);
  const consolationFinal = matches.find((m) => m.matchUpId === onward.winnerMatchUpId);
  const mainNext = mainMatches.find((m) => m.matchUpId === pending.winnerMatchUpId);
  const mainPosition = pending.drawPositions?.find(Boolean);
  const mainWaiting = mainNext?.drawPositions?.find(Boolean);
  const consolationWaiting = onward.drawPositions?.find(Boolean);
  if (
    !paired ||
    paired.matchUpStatus !== COMPLETED ||
    paired.winningSide !== 1 ||
    pending.drawPositions?.length !== 1 ||
    !mainPosition ||
    mainPosition !==
      getSideDrawPosition({ drawDefinition: draw, structureId: main.structureId, matchUp: paired, sideNumber: 1 }) ||
    !mainNext ||
    !openNestedTarget(mainNext) ||
    mainNext.drawPositions?.length !== 1 ||
    !mainWaiting ||
    mainWaiting >= mainPosition ||
    !consolationFinal ||
    !openNestedTarget(consolationFinal) ||
    consolationFinal.drawPositions?.length !== 0 ||
    consolationFinal.winnerMatchUpId ||
    consolationFinal.loserMatchUpId ||
    onward.drawPositions?.length !== 1 ||
    !consolationWaiting ||
    !vacant(consolationWaiting) ||
    consolationWaiting >= advancing ||
    !at(advancing)?.participantId ||
    onward.matchUpStatus !== DEFAULTED ||
    origin?.previousMatchUpStatus !== DOUBLE_DEFAULT ||
    origin.matchUpStatus !== DEFAULTED ||
    onward.sideStatusCodes ||
    onward.matchUpStatusCodes?.length ||
    previous?.matchUpStatus !== DOUBLE_DEFAULT ||
    first?.matchUpStatus !== BYE ||
    feeder?.matchUpStatus !== BYE ||
    feeder.winnerMatchUpId !== onward.matchUpId
  )
    return;
  const arrivals = {
    paired,
    mainNext,
    consolationFinal,
    mainPosition,
    mainWaiting,
    consolationWaiting,
  };
  return { ...shared, arrivals };
}

type Reservation = NonNullable<ReturnType<typeof reservation>>;

function applyReservation(copy: RecordCopy, r: Reservation) {
  const { drawDefinition, tournamentRecord } = copy;
  const tournamentId = tournamentRecord?.tournamentId;
  const scoreExit = (matchUp: MatchUp, awarded: boolean, paired?: MatchUp) => {
    matchUp.matchUpStatus = DEFAULTED;
    delete matchUp.orderOfFinish;
    matchUp.matchUpStatusCodes = [];
    delete matchUp.matchUpStatusCode;
    delete matchUp.sideStatusCodes;
    if (awarded) matchUp.winningSide = 1;
    // Score subscribers see the result before provenance is merged into the target.
    announceNestedScore(copy, matchUp);
    mergeSideExitProvenance({
      matchUp,
      provenance: buildSideExitProvenance({
        sourceMatchUpId: r.source.matchUpId,
        sourceMatchUpStatus: DOUBLE_DEFAULT,
        sourceSideNumber: 2,
        pairedMatchUpId: paired?.matchUpId,
        pairedMatchUpStatus: paired?.matchUpStatus,
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
  const arrivals = r.arrivals;
  if (arrivals) {
    r.onward.winningSide = 2;
    r.onward.matchUpStatusCodes = [];
    r.onward.score = undefined;
    r.onward.drawPositions = [arrivals.consolationWaiting, r.advancing];
  } else r.onward.drawPositions = [r.advancing];
  modifyMatchUpNotice({ tournamentId, drawDefinition, matchUp: r.onward, context: 'advanceWinner' });
  if (arrivals) {
    const final = arrivals.consolationFinal;
    final.score = undefined;
    final.winningSide = undefined;
    final.drawPositions = [r.advancing];
    modifyMatchUpNotice({ tournamentId, drawDefinition, matchUp: final, context: 'advanceWinner' });
  }
  modifyPositionAssignmentsNotice({ tournamentId, drawDefinition, structure: r.consolation, event: undefined });
  scoreExit(r.pending, !!arrivals, arrivals?.paired);
  if (arrivals) {
    arrivals.mainNext.drawPositions = [arrivals.mainWaiting, arrivals.mainPosition];
    arrivals.mainNext.winningSide = undefined;
    modifyMatchUpNotice({ drawDefinition, matchUp: arrivals.mainNext, context: 'assignMatchUpDrawPosition' });
  }
}

export function nestedReservationSuffix(args: BuildViewArgs, view: OutcomeView, prefix: OutcomeOp[]) {
  const draw = args.drawDefinition,
    id = args.request.matchUpId;
  if (
    !draw ||
    !id ||
    draw.drawType !== FIRST_MATCH_LOSER_CONSOLATION ||
    args.request.matchUpStatus !== DOUBLE_DEFAULT ||
    !plainNestedPrefix(args, view, prefix)
  )
    return;
  const certify = (current: DrawDefinition, reading: OutcomeView) =>
    current.drawType === FIRST_MATCH_LOSER_CONSOLATION && args.request.matchUpStatus === DOUBLE_DEFAULT
      ? reservation(current, reading, id, args.request.flags.propagateExitStatus === true)
      : undefined;
  if (!certify(draw, view)) return;
  return nestedDraft(args, draw, prefix, certify, (copy, r) => {
    applyReservation(copy, r);
    const matches = [r.pending, r.loser, r.crossing, r.onward];
    if (r.arrivals) matches.push(r.arrivals.mainNext, r.arrivals.consolationFinal);
    return { matches, assignments: r.consolation };
  });
}
