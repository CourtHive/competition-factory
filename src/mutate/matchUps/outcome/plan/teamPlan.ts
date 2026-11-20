import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { matchUpsOf, positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { ensuredDualSides } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

import {
  CLEAR_SCORE,
  DOUBLE_EXIT,
  LINE_SCORE,
  REMOVE_DIRECTED,
  deciderSeats,
  indexed,
  heldByeLoser,
  loserByeArrival,
  sideDrawPosition,
  standingAwardArrival,
  storedLoserId,
} from './planShared';

// constants and types
import type { DrawDefinition, Score, Side } from '@Types/tournamentTypes';
import { LINEUPS } from '@Constants/extensionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { LineUp } from '@Types/factoryTypes';
import type { OutcomeOp } from '../ops';
import {
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  IN_PROGRESS,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import type {
  AbstainReason,
  DirectionPlan,
  DualCall,
  MatchUpWrite,
  OutcomeRequest,
  OutcomeView,
  PlanArgs,
  Route,
} from '../types';

/**
 * The TEAM shapes (S7): what keeps a dual or line v1's, a dual's own call, its tally after a line's result, and the
 * line-ups a decided dual carries or a loser's assignment writes.
 */

/**
 * S7: a TEAM line's own single exit (WALKOVER, DEFAULTED, RETIRED), deciding its dual (`winner`) or un-deciding a dual
 * decided before (`line-score`: its lines, with this one, project no winner). The line is written as v1 writes a line
 * result, with the exit's status and its winner; nothing of the draw is directed by a line, and the dual's part is the
 * dual's own call. Only a fresh line's single exit reaches here: a line's exit cleared or corrected is read before
 * (`clearedSingleExit`, `correctedSingleExit`), and `teamReason` keeps v1's every line not to be played. Stays v1's: a
 * DEFAULTED under a scoring policy's process codes (v1 writes the codes on the line).
 */
export function lineExitReason(view: OutcomeView, write?: MatchUpWrite): AbstainReason | undefined {
  return write?.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes ? 'exit' : undefined;
}

/**
 * S7: a TEAM call is v1's but for its owned shape: a line's first result (scored, a winner alone, a single exit:
 * WALKOVER, DEFAULTED, RETIRED, or a double exit written as it stands), whose dual's tally follows from it. v1 writes the
 * line, then `updateTieMatchUpScore` writes the dual through `modifyMatchUpScore`, with no `scoredTime`: the sides it
 * ensures and the tieFormat it copies on (`line.dualRewrite`, where they change: on a dual's first line, or a record
 * that stored neither), its tally and the status it derives from it; a dual already decided keeps its winner and is
 * directed no further. A line that decides its dual is planned with the dual's own call. A line's result removed, or a
 * line cleared, or its result corrected, is planned where its dual's winner does not change and the dual still holds a
 * line's result: the line rewritten, the dual's tally re-read (it directs nothing: `removalReason` is not asked, nor is
 * it a re-entered or changed winner). A line that un-decides its dual (`line-score`) is planned with the dual's own
 * removal (`undecidingLineOps`). Stay v1's: a removal or correction that un-decides its dual by its own route, a removal
 * that leaves the dual holding no result (`updateTieMatchUpScore` removes its score and an inherited tieFormat), a
 * REPORTED score, and auto-calc off. A line in a round robin takes its dual's group tally (`groupTally`).
 */
export function teamReason({
  request,
  asDual,
  route,
  view,
  dual,
}: {
  request: OutcomeRequest;
  view: OutcomeView;
  dual?: DualCall;
  asDual?: true;
  route?: Route;
}): AbstainReason | undefined {
  if (asDual) return undefined;
  if (!view.isTeam && !view.line && !view.matchUpTieId && !view.existing.collectionId) return undefined;
  if (view.isTeam && !view.line) return dualCallReason(view, route, request);
  const { line, existing } = view;
  // a line's result with a winner, or its double exit (written as it stands, `only-score`, its dual tallied without it)
  if (!line || view.isTeam) return 'team';
  // a line's result removed, or a line cleared: v1 clears it and re-reads its dual's tally (`removeDirectedParticipants`)
  const removing = route === REMOVE_DIRECTED || route === CLEAR_SCORE;
  // a line that un-decides its dual: the dual's own removal is planned with it (`undecidingLineOps`, S7)
  const undeciding = route === LINE_SCORE && !!dual;
  if (!removing && !undeciding && route !== 'winner' && !isDoubleExit(request.matchUpStatus)) return 'team';
  // a line's stored result corrected (`winner` over a winner)
  const correcting = (route === 'winner' || undeciding) && !!existing.winningSide;
  if (!removing && !correcting && !undeciding && (existing.matchUpStatus !== TO_BE_PLAYED || existing.winningSide))
    return 'team';
  if (line.autoCalcDisabled || line.dualRewrite.scoreReported || !line.projectedScore) return 'team';
  if (reDirectsOrUnwinds(view, { removing, correcting })) return 'team';
  // a line given a winner whose own sides do not both hold a participant (no line-up assigned): v1 refuses it before
  // its first write (`directParticipants` → `attemptToModifyScore`'s `validToScore`, MISSING_ASSIGNMENTS)
  if (route === 'winner' && !lineValidToScore(view, request)) return 'team';
  // a round robin's group tally is re-read from the dual the line writes (S7: `groupTally`, the group read off the dual)
  if (view.draw.tallied && !view.group) return 'team';
  // a line played on a dual already decided keeps its winner: only the dual's tally changes. A fresh line cannot hand it
  // to the other side, and one that un-decides it (a dual decided by its own call or its own exit, which v1 then projects
  // from its lines alone) is routed `line-score` and planned with the dual's own removal (`undecidingLineOps`); a line
  // that is itself a single exit passes `lineExitReason` first (S7)
  // a removal or correction that changes the dual's winner: v1 takes the dual's winner back out of the next dual
  if ((removing || correcting) && line.projectedWinningSide !== line.dualWinningSide) return 'team';
  // a line's double exit names no winner, so it is never routed `line-score` (`only-score`): on a dual decided by its
  // own call, whose lines project no winner, v1 takes the dual's winner back out of the next dual before it writes the
  // line (`attemptToSetMatchUpStatus`'s `scoreModification`, `removeDirectedParticipants`). Where the dual directed
  // nobody (a round robin's, a final's: no next dual, no loser link) nothing is taken back, and the tally is all
  const directed = !!(view.targets.winnerMatchUpId || view.targets.loserMatchUpId);
  if (directed && isDoubleExit(request.matchUpStatus) && line.dualWinningSide && !line.projectedWinningSide)
    return 'team';
  if (line.dualWinningSide) return undefined;
  const dualStatuses = new Set<string | undefined>([TO_BE_PLAYED, IN_PROGRESS, DEAD_RUBBER]);
  if (!dualStatuses.has(line.dualMatchUpStatus)) return 'team';
  // a line that decides its dual: the dual's own call is planned with it (`decidingLineOps`, S7)
  if (line.projectedWinningSide) return dual && line.projectedStatus === COMPLETED ? undefined : 'team';
  return line.projectedStatus === IN_PROGRESS ? undefined : 'team';
}

/**
 * Three line shapes v1 does more for than the line and its dual's tally, each read off v1's whole write:
 *  - a line corrected from the other side to the dual's own winner: v1 clears the line first and tallies the dual
 *    without it, and a dual its other lines do not decide (one decided by its own call) is un-decided there and then
 *    directed again (`attemptToSetWinningSide`, `redirectsUndecidedDual`): taken back and sent on, stamped, announced;
 *  - a fresh line that hands a decided dual to the other side (a dual decided by its own call, against its lines): v1
 *    takes the old winner's direction back and directs the new one (`attemptToSetWinningSide`, `handsOver`);
 *  - a line's own double exit cleared or replaced by a score with no winner: it produced nothing, so there is no
 *    unwind to plan as a draw matchUp's double exit has one (`unwoundOps`).
 */
function reDirectsOrUnwinds(view: OutcomeView, { removing, correcting }: { removing: boolean; correcting: boolean }) {
  const { line, existing } = view;
  if (!line) return false;
  const projectsDualWinner = line.projectedWinningSide === line.dualWinningSide;
  if (correcting && existing.winningSide !== line.dualWinningSide && projectsDualWinner) return true;
  // ...and from the dual's winner to the other side under a tally that still names that winner (games or sets
  // aggregated: the line keeps its score): the same clear, un-deciding and directing again
  if (correcting && !!line.dualWinningSide && projectsDualWinner && line.talliedByScore) return true;
  if (!existing.winningSide && line.dualWinningSide && line.projectedWinningSide && !projectsDualWinner) return true;
  return removing && isDoubleExit(existing.matchUpStatus);
}

/**
 * v1's `validToScore` (`attemptToModifyScore`) as it reads a line, which stores no drawPositions of its own: both of
 * its sides hold a participant; or the scoring policy does not require participants; or one side does and the line is
 * ad hoc, DEFAULTED, or a single exit.
 */
function lineValidToScore(view: OutcomeView, request: OutcomeRequest): boolean {
  const { count, requireForScoring } = view.participants;
  if (count === 2 || !requireForScoring) return true;
  if (count !== 1) return false;
  return !!view.draw.isAdHoc || isExit(request.matchUpStatus);
}

/**
 * S7: a dual's own call given a winner, or its own double exit. v1 writes a winner as any winner (`directParticipants`:
 * the result, `scoredTime`, the winner placed in the next dual, announced `assignMatchUpDrawPosition`), and a double exit
 * as any double exit (`doubleExitAdvancement`: the exit it produces in the next dual, BYEs on the seats its loser links
 * feed), after `ensureSideLineUps` has written the dual's sides (`ensuredSides`). It carries no line-up on: that is a
 * deciding line's (`propagateLineUp`), its first entry's drawPosition not yet sided in the next dual. An exit carried
 * across a loser link is written on the dual it reaches by that dual's own call (`carriedDualLanding`). A dual already
 * decided is planned as any decided matchUp is: its winner entered again writes the team's line-up on the next dual
 * (`winnerLineUpOps`), a changed winner is re-directed. A call that disables auto-calc writes `disableAutoCalc`, one
 * that enables it removes it and takes the winner its lines project (`autoCalcWrite`, `dualProjection`). Stays v1's: an
 * enabling call whose lines project no winner (not the winner's route), and a dual holding no winner and neither to be
 * played nor in progress (a double exit). A dual in a round robin takes its group's tally (`groupTally`).
 */
function dualCallReason(
  view: OutcomeView,
  route: Route | undefined,
  request: OutcomeRequest,
): AbstainReason | undefined {
  const { existing } = view;
  if (route !== 'winner' && route !== DOUBLE_EXIT) return 'team';
  // C22 control: v1's late assignment check refuses this bare half-arrived dual after ensuring its sides.
  // Keep its side/stamp prefix and error in v1; the scoring-policy override still permits the call.
  if (
    existing.matchUpStatus === TO_BE_PLAYED &&
    !existing.winningSide &&
    view.participants.requireForScoring &&
    view.participants.required &&
    view.participants.count === 1 &&
    !view.draw.isAdHoc &&
    request.winningSide &&
    !request.matchUpStatus &&
    !request.score
  )
    return 'team';
  // a dual decided is planned as any decided matchUp is (its winner entered again or changed); one holding another
  // status (a double exit, or neither to be played nor in progress) stays v1's
  const open = existing.matchUpStatus === TO_BE_PLAYED || existing.matchUpStatus === IN_PROGRESS;
  if (!open && !existing.winningSide) return 'team';
  // a dual in a round robin: its group's tally re-read with its result in place (`groupTally`)
  return view.draw.tallied && !view.group ? 'team' : undefined;
}

/**
 * S7: the dual after its line's result, as `updateTieMatchUpScore` writes it (`modifyMatchUpScore`): a dual already
 * decided keeps its winner
 */
export const dualTallyOps = (line?: OutcomeView['line'], route?: Route): OutcomeOp[] =>
  line?.projectedScore && line.projectedStatus
    ? [
        {
          op: 'setMatchUpResult',
          matchUpId: line.dualMatchUpId,
          matchUpStatus: line.projectedStatus,
          winningSide: line.projectedWinningSide as 1 | 2 | undefined,
          score: line.projectedScore as Score,
          stampsScoredTime: false,
          dualTally: {
            sides: line.dualRewrite.sides,
            tieFormat: line.dualRewrite.tieFormat,
            ...(line.dualRewrite.clearsTieFormatId ? { clearsTieFormatId: true as const } : {}),
            ...(line.dualRewrite.clearsInitialScore ? { clearsInitialScore: true as const } : {}),
            ...(route === REMOVE_DIRECTED || route === CLEAR_SCORE ? { unreturned: true as const } : {}),
          },
        },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: line.dualMatchUpId },
      ]
    : [];

/**
 * The winning team's line-up on its side of the next dual, as v1's `propagateLineUp` carries it: the line-up the decided
 * dual's winning side holds (once its line has been written and its sides ensured), without substitutions
 * (`removeLineUpSubstitutions`, which regroups each player's assignments), on the side v1 reckons by roundPosition
 * (draw-positions.md rule 4: a feed round's advancing team, or one advanced by position, is side 2). No next dual (a
 * final) or no line-up held, nothing.
 */
export function lineUpCarry({
  line,
  winningSide,
  dual,
}: {
  line: NonNullable<OutcomeView['line']>;
  winningSide: 1 | 2;
  dual: DualCall;
}) {
  const next = dual.direction?.winner?.matchUpId;
  if (!next) return undefined;
  const sides = line.dualRewrite.sidesAsHeld as { sideNumber?: number; lineUp?: LineUp }[] | undefined;
  const held = sides?.find((side) => side.sideNumber === winningSide)?.lineUp;
  if (!held) return undefined;
  const inContext = dual.view.inContextDrawMatchUps;
  const source = inContext?.find((matchUp) => matchUp.matchUpId === line.dualMatchUpId)?.roundPosition;
  const target = inContext?.find((matchUp) => matchUp.matchUpId === next);
  if (!source || !target?.roundPosition) return false;
  const advancedByPosition =
    (source === target.roundPosition && source !== 1) || Math.floor(source / 2) === target.roundPosition;
  const sideNumber = target.feedRound || advancedByPosition ? 2 : 1;
  const lineUp = removeLineUpSubstitutions({ lineUp: held.filter((assignment) => assignment?.participantId) });
  return { op: 'setSideLineUp' as const, matchUpId: next, sideNumber, lineUp, announcedAs: 'directWinner' as const };
}

/**
 * The losing team's line-up on its side of the dual a loser link sends it to, as v1's `propagateLoserLineUp` carries it:
 * the line-up the decided dual's losing side holds, every assignment kept (unlike the winner's, none is filtered),
 * without substitutions, on side `2 - (roundPosition % 2)` of a first-round target and side 1 of a later round. A
 * loser kept out of a first-match feed (a BYE takes the seat) carries nothing; a loser seated opposite a BYE carries it
 * onto the BYE matchUp, and goes on (`loserLineUpBeyond`).
 * The dual a line decides is COMPLETED, so its loser carries no exit (v1 returns before the carry where a fed exit
 * propagates).
 */
export function loserLineUpCarry({
  line,
  winningSide,
  dual,
}: {
  line: NonNullable<OutcomeView['line']>;
  winningSide: 1 | 2;
  dual: DualCall;
}) {
  const loser = dual.direction?.loser;
  if (!loser?.arrives) return undefined;
  // as the losing side held it before the line's write; holding none, v1 carries nothing, and the sides the loser's
  // assignment wrote stand (`updateSideLineUp`, from the draw's line-ups): v1's
  const sides = line.dualRewrite.sidesInContext as { sideNumber?: number; lineUp?: LineUp }[] | undefined;
  const held = sides?.find((side) => side.sideNumber === 3 - winningSide)?.lineUp;
  if (!held) return false;
  const inContext = dual.view.inContextDrawMatchUps;
  const source = inContext?.find((matchUp) => matchUp.matchUpId === line.dualMatchUpId)?.roundPosition;
  const roundNumber = inContext?.find((matchUp) => matchUp.matchUpId === loser.matchUpId)?.roundNumber;
  if (!source || !roundNumber) return false;
  // in a Decider (the winner's target too) the loser sits second: v1's `propagateLoserLineUp`
  const decider = dual.direction?.winner?.matchUpId === loser.matchUpId;
  const consolationSide = roundNumber === 1 ? 2 - (source % 2) : 1;
  const sideNumber = decider ? 2 : consolationSide;
  const lineUp = removeLineUpSubstitutions({ lineUp: held });
  return {
    op: 'setSideLineUp' as const,
    matchUpId: loser.matchUpId,
    sideNumber,
    lineUp,
    announcedAs: 'directLoser' as const,
  };
}

/**
 * A losing team seated opposite a BYE goes on through it into the dual beyond, whose side v1 writes as the loser's
 * assignment writes any dual's (`assignTeamLineUp` → `updateSideLineUp`): the team's line-up as the draw holds it, on the
 * side holding the loser's drawPosition, announced `updateSidLineUp`. The dual beyond's notice comes before the BYE
 * matchUp's carry; a team the draw holds no line-up for takes none, as v1 writes it. Abstained (v1's): a drawPosition the
 * dual beyond does not side yet.
 */
export function loserLineUpBeyond({ dual, drawDefinition }: { dual: DualCall; drawDefinition: DrawDefinition }) {
  const loser = dual.direction?.loser;
  const { loserThroughBye, loserTargetDrawPosition } = dual.view.targets;
  const passage = loserByeArrival(dual.view, loser, dual.route, dual.write);
  const through = loser?.arrives ? (loserThroughBye ?? passage?.through) : undefined;
  const reached = [through?.matchUpId, ...(passage?.byes.toReversed() ?? [])].filter((id): id is string => !!id);
  if (!loser || !reached.length) return undefined;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const ops: OutcomeOp[] = [];
  for (const matchUpId of reached) {
    const target = indexed(dual.view, matchUpId);
    const sideNumber = target?.sides?.find((side) => side.drawPosition === loserTargetDrawPosition)?.sideNumber;
    if (!sideNumber) return false;
    ops.push({
      op: 'setSideLineUp',
      matchUpId,
      sideNumber,
      lineUp: lineUps[loser.participantId],
      announcedAs: 'updateSidLineUp',
    });
  }
  return ops;
}

/**
 * S7: a dual's own call whose loser a link places. The loser's assignment writes the team's line-up, as the draw holds it,
 * on its side of each dual it reaches (`assignTeamLineUp` → `updateSideLineUp`, announced `updateSidLineUp`): past a BYE
 * the dual beyond first, then the BYE matchUp. No line-up is carried from the dual itself (that is a deciding line's
 * `propagateLoserLineUp`). False where a dual does not side the drawPosition (v1's).
 */
function assignedLineUpOps(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  loser: NonNullable<DirectionPlan['loser']>,
  through?: { matchUpId: string },
  plainPassage?: ReturnType<typeof loserByeArrival>,
): OutcomeOp[] | false {
  const { loserMatchUpId, loserTargetDrawPosition, loserByePassage } = view.targets;
  const { participantId } = loser;
  const awarded = standingAwardArrival(view, loser);
  const replacedId = view.existing.winningSide ? storedLoserId(view) : undefined;
  // (a loser held opposite a structural BYE is taken back by the BYE's own path, C21, which announces no event)
  const replaced = !!replacedId && view.targets.loserTargetSeat?.participantId === replacedId && !heldByeLoser(view);
  // A loser replaced on a dual that stores a line-up for them: v1 takes them back first and deletes it
  // (`removeDirectedLoser`), and whether that removal's notice, with the event, is the one the dual's notice keeps turns
  // on the path the removal takes, which the planners do not follow. The call is v1's whole write (2026-11-19, TEAM
  // FEED_IN_CHAMPIONSHIP 8/7 and FIRST_MATCH_LOSER_CONSOLATION 8/6, walk seeds 30 and 24, a RETIRED result changed: the
  // event differed both ways)
  // A result that stood as a walkover or default is not asked here: its correction is settled as v1's (`settle`).
  if (
    replacedId &&
    loserMatchUpId &&
    view.existing.matchUpStatus !== WALKOVER &&
    view.existing.matchUpStatus !== DEFAULTED &&
    view.targets.loserTargetSeat?.participantId === replacedId &&
    storedLineUpAtIndex(view, drawDefinition, loserMatchUpId, loserTargetDrawPosition)
  )
    return false;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const ops: OutcomeOp[] = [];
  // Carried passages keep their established order; a plain arrival returns from the furthest dual first (C20).
  const passed = loserByePassage?.byes ?? [];
  const reached = plainPassage
    ? [through?.matchUpId, ...plainPassage.byes.toReversed(), loserMatchUpId]
    : [through?.matchUpId, loserMatchUpId, ...passed];
  for (const matchUpId of reached) {
    if (!matchUpId) continue;
    const target = view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
    const sideNumber = target?.sides?.find((side) => side.drawPosition === loserTargetDrawPosition)?.sideNumber;
    if (!sideNumber) return false;
    ops.push({
      op: 'setSideLineUp',
      matchUpId,
      sideNumber,
      lineUp: lineUps[participantId],
      announcedAs: 'updateSidLineUp',
      // The own dual's lineup writer omits the event. An assignment at a standing award already
      // announced it, and v1 retains that identity when the keyed notices coalesce (C24N). So does a changed winner:
      // the loser it replaces there was taken back first, announced with the event (`removeDirectedLoser`)
      ...(matchUpId === loserMatchUpId && !awarded && !replaced ? { announcesEvent: false as const } : {}),
    });
  }
  // the dual the loser lands in is otherwise untouched (the arrival is written on its structure's assignments): its
  // notice stamps it. Past a BYE, the dual beyond is stamped with its positions
  if (loserMatchUpId) ops.push({ op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId });
  return ops;
}

/** Assignment ensures relay side objects before the carry; the lineup's actual notice follows placement. */
export function initialRelayLineUpOps(lineUps: OutcomeOp[], relay: OutcomeOp[]): OutcomeOp[] {
  return lineUps.flatMap((op): OutcomeOp[] =>
    op.op === 'setSideLineUp' &&
    relay.some((write) => write.op === 'mergeSideExitProvenance' && write.matchUpId === op.matchUpId)
      ? [{ ...op, quiet: true }]
      : [],
  );
}

/**
 * S7: the line-ups a dual's own call writes through its assignments: a re-entered winner's on the next dual
 * (`winnerLineUpOps`), then the loser's where it lands (`assignedLineUpOps`). False where a dual does not side the
 * drawPosition (v1's).
 */
export function dualLineUpOps(
  args: PlanArgs & { drawDefinition: DrawDefinition },
  loser?: DirectionPlan['loser'],
  loserThrough?: { matchUpId: string },
): OutcomeOp[] | false {
  const { view, drawDefinition } = args;
  const decider = args.write && args.route === 'winner' && deciderSeats(view, args.write, args.direction);
  if (decider && loser) return deciderAssignedLineUpOps(view, drawDefinition, decider, loser);
  const arrived = loser?.arrives
    ? assignedLineUpOps(view, drawDefinition, loser, loserThrough, loserByeArrival(view, loser, args.route, args.write))
    : [];
  return arrived && [...winnerLineUpOps(args), ...arrived];
}

/**
 * S7: the stored winner of a decided dual entered again by its own call. v1 assigns the winner's drawPosition in the
 * next dual again (`assignMatchUpDrawPosition`), where it now stands, so the assignment writes the team's line-up, as
 * the draw holds it, on that side (`assignTeamLineUp` → `updateSideLineUp`, announced `updateSidLineUp` with no event):
 * a line-up a deciding line carried there is replaced. A first entry, or a changed winner, writes none: the drawPosition
 * is not yet sided there (v1's view is read before the assignment).
 */
function winnerLineUpOps(args: PlanArgs & { drawDefinition: DrawDefinition }): OutcomeOp[] {
  const { view, write, direction, drawDefinition, request } = args;
  const next = direction?.winner;
  if (!next) return [];
  const inContext = view.inContextDrawMatchUps;
  const dual = inContext?.find((matchUp) => matchUp.matchUpId === request.matchUpId);
  const drawPosition = dual?.sides?.find((side) => side.sideNumber === write?.winningSide)?.drawPosition;
  const target = inContext?.find((matchUp) => matchUp.matchUpId === next.matchUpId);
  // across a winner link the drawPosition is the source structure's: it sides nothing in the next dual (BATCH 1, A1)
  if (target?.structureId !== dual?.structureId) return [];
  const sideNumber = drawPosition && target?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (!sideNumber) return [];
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  return [
    {
      op: 'setSideLineUp',
      matchUpId: next.matchUpId,
      sideNumber,
      lineUp: lineUps[next.participantId],
      announcedAs: 'updateSidLineUp',
      // a winner who already stands there is assigned nothing new, and the line-up's notice is the dual's only one;
      // one placed by this call was announced with the event first (`assignMatchUpDrawPosition`), which v1 keeps
      ...(view.existing.winningSide === write?.winningSide ? { announcesEvent: false as const } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/**
 * S7: a dual's exit carried across its loser link is written on the dual it lands on by that dual's own call
 * (`setMatchUpState`), whose `ensureSideLineUps` first writes its sides with the team arrived: the carried write takes
 * them as `ensuredSides` (`ensuredDualSides`, the one rule). That dual is the one the losing team reaches, or, past a BYE
 * there, the dual beyond it (RULE 1: the BYE dual keeps its BYE, records the carry beside it and takes the team's line-up
 * from the assignment, `assignedLineUpOps`). The line-up the team's assignment wrote is the draw's, the line-up that rule
 * falls back to, and one edited on the dual since is the one it keeps: the stored sides are read as they stand. Planned
 * where the carry lands on one dual, both its sides holding their drawPositions, and goes no further.
 */
export function carriedDualLanding(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  landing: OutcomeOp[],
  loser?: NonNullable<DirectionPlan['loser']>,
): OutcomeOp[] | undefined {
  const { loserTargetDrawPosition } = view.targets;
  const written = landing.filter((op) => op.op === 'setMatchUpResult');
  if (!written.length) return landing;
  // a carry written on a dual the loser already stands in (a result relabelled an exit that carries): that dual's own
  // call still ensures its sides first, which the landing as planned for an arrival does not state
  if (!loser?.arrives) return undefined;
  const { participantId } = loser;
  // the carry lands on one dual: the one the loser reaches, or past a BYE the dual beyond it (RULE 1, its passage); a
  // carry on past that dual (its own loser link: the carrier placed again, whose assignment writes the team's line-up
  // there) is v1's
  const landedOn = written[0].matchUpId;
  if (written.some((op) => op.matchUpId !== landedOn) || landing.some((op) => op.op === 'assignPosition'))
    return undefined;
  const reached = indexed(view, landedOn);
  // planned where both the dual's sides hold their drawPositions (the loser's is one of them): a side holding none (a
  // DOUBLE_ELIMINATION losers' round, half placed) is hydrated unnumbered, and v1 reads it numbered after the arrival
  const seated = reached?.sides?.filter((side) => side.drawPosition) ?? [];
  if (seated.length !== 2) return undefined;
  const rawSides = storedSides(drawDefinition, landedOn);
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS });
  const loserSideNumber = reached?.sides?.find((side) => side.drawPosition === loserTargetDrawPosition)?.sideNumber;
  const ensuredSides = ensuredDualSides({
    contextSides: reached?.sides?.map((side) =>
      side.drawPosition === loserTargetDrawPosition ? { ...side, participantId } : side,
    ),
    // The loser's assignment has already called updateSideLineUp, numbering both stored sides and writing the team's
    // line-up, as the draw holds it, on the loser's side: a line-up a team taken back out of that seat left there (a
    // result cleared) is replaced, not kept (2026-11-19, TEAM FEED_IN_CHAMPIONSHIP 8, walk seed 28)
    rawSides: [1, 2].map((sideNumber) => ({
      ...(rawSides?.find((side) => side.sideNumber === sideNumber) ?? {}),
      sideNumber,
      ...(sideNumber === loserSideNumber
        ? { lineUp: makeDeepCopy((lineUps as Record<string, LineUp> | undefined)?.[participantId], false, true) }
        : {}),
    })),
    lineUps,
  });
  return landing.map((op) =>
    op.op === 'setMatchUpResult' && op.matchUpId === landedOn ? { ...op, ensuredSides } : op,
  );
}

/** whether the stored side at the index of the hydrated side holding `drawPosition` holds a line-up */
function storedLineUpAtIndex(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  matchUpId: string,
  drawPosition?: number,
): boolean {
  const index = indexed(view, matchUpId)?.sides?.findIndex((side) => side.drawPosition === drawPosition) ?? -1;
  return index >= 0 && !!storedSides(drawDefinition, matchUpId)?.[index]?.lineUp;
}

/** a matchUp's sides as stored (not hydrated), read off the draw's structures */
function storedSides(drawDefinition: DrawDefinition, matchUpId: string): Side[] | undefined {
  for (const structure of drawDefinition.structures ?? []) {
    const found = matchUpsOf(structure)?.find((matchUp) => matchUp.matchUpId === matchUpId);
    if (found) return found.sides;
  }
  return undefined;
}

/**
 * A line un-decides its dual: v1 takes the dual's winner back out of the next dual and its loser back out of the dual
 * their link feeds, and with each the line-up the dual stores for them there. The winner's goes where the stored side
 * at the index of their hydrated side holds one (`positionClear`'s `handleTeamPositionRemoval`), and the key itself off the side
 * numbered as theirs (`removeSubsequentRoundsParticipant`); the loser's wherever
 * that stored side exists, with the target's codes derived again and the target announced (`removeDirectedLoser`). The
 * removal the planners make (`undecidingLineOps`: the dual's own, as any matchUp's) states neither, so a call that
 * meets one is v1's whole. The loser's side opposite a structural BYE is planned (`removedByeLineUpOps`, C21).
 */
export function undecidingLeavesLineUp(view: OutcomeView, drawDefinition: DrawDefinition): boolean {
  const { targets, existing } = view;
  const sidesOf = (matchUpId?: string, drawPosition?: number) => {
    const hydrated = matchUpId ? indexed(view, matchUpId) : undefined;
    const index = drawPosition ? (hydrated?.sides?.findIndex((side) => side.drawPosition === drawPosition) ?? -1) : -1;
    const stored = matchUpId && index >= 0 ? storedSides(drawDefinition, matchUpId) : undefined;
    const sideNumber = hydrated?.sides?.[index]?.sideNumber;
    return {
      atIndex: stored?.[index],
      numbered: stored?.find((side) => !!sideNumber && side.sideNumber === sideNumber),
    };
  };
  const winnerPosition = existing.winningSide ? sideDrawPosition(view, existing.winningSide as 1 | 2) : undefined;
  const winner = sidesOf(targets.winnerMatchUpId, winnerPosition);
  // the side numbered as theirs loses the key itself, whatever it holds (`removeSubsequentRoundsParticipant`)
  if (winner.atIndex?.lineUp || (winner.numbered && 'lineUp' in winner.numbered)) return true;
  return !heldByeLoser(view) && !!sidesOf(targets.loserMatchUpId, targets.loserTargetDrawPosition).atIndex;
}

/** C21: a line un-decides its dual; v1 deletes the losing team's entry line-up after releasing its seat. */
export function removedByeLineUpOps(view: OutcomeView, drawDefinition: DrawDefinition): OutcomeOp[] | false {
  const held = heldByeLoser(view);
  if (!held) return [];
  const index = held.entry.sides?.findIndex((side) => side.drawPosition === held.drawPosition) ?? -1;
  const sides = storedSides(drawDefinition, held.entry.matchUpId);
  const target = index >= 0 ? sides?.[index] : undefined;
  // v1 writes nothing when the stored side is absent; an unnumbered or duplicate side stays its own shape.
  if (!target) return [];
  const sideNumber = target.sideNumber;
  if ((sideNumber !== 1 && sideNumber !== 2) || sides?.filter((side) => side.sideNumber === sideNumber).length !== 1)
    return false;
  return [
    {
      op: 'setSideLineUp',
      matchUpId: held.entry.matchUpId,
      sideNumber,
      lineUp: undefined,
      clearsLineUp: true,
      announcedAs: 'removeDirectedLoser',
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: held.entry.matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: held.entry.structureId },
  ];
}

/** C26: the carrier has just advanced through a BYE; ensure the landing dual's stored sides. */
export function carriedByeDualSides(drawDefinition: DrawDefinition, entry: HydratedMatchUp) {
  return ensuredDualSides({
    contextSides: entry.sides,
    rawSides: storedSides(drawDefinition, entry.matchUpId),
    lineUps: firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }),
  });
}

/**
 * BATCH 1 (A2, TEAM): a final's losing team is seated in the Decider on the seat the winner left (`deciderSeats`), and
 * its assignment writes the team's line-up, as the draw holds it, on that side (`assignTeamLineUp`). The carries then
 * write each team's line-up, as its final held it, on its own side (`lineUpCarry` side 1, `loserLineUpCarry` side 2).
 */
export function deciderLineUpOps({ dual, drawDefinition }: { dual: DualCall; drawDefinition: DrawDefinition }) {
  const seats = dual.write && deciderSeats(dual.view, dual.write, dual.direction);
  const loser = dual.direction?.loser;
  if (!seats || !loser) return [];
  const target = indexed(dual.view, loser.matchUpId);
  const sideNumber = target?.sides?.find((side) => side.drawPosition === seats.loserDrawPosition)?.sideNumber;
  if (!sideNumber) return false;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const op: OutcomeOp = {
    op: 'setSideLineUp',
    matchUpId: loser.matchUpId,
    sideNumber,
    lineUp: lineUps[loser.participantId],
    announcedAs: 'updateSidLineUp',
  };
  return [op];
}

/**
 * BATCH 1 (A2, TEAM): a final decided by its own call seats both teams in the Decider, and each assignment writes its
 * team's line-up, as the draw holds it, on its side (`assignTeamLineUp`): the winner's first, then the loser's.
 */
function deciderAssignedLineUpOps(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  seats: NonNullable<ReturnType<typeof deciderSeats>>,
  loser: NonNullable<DirectionPlan['loser']>,
): OutcomeOp[] | false {
  const target = indexed(view, loser.matchUpId);
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const ops: OutcomeOp[] = [];
  for (const [drawPosition, participantId] of [
    [seats.winner.drawPosition, seats.winner.participantId],
    [seats.loserDrawPosition, loser.participantId],
  ] as const) {
    const sideNumber = target?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
    if (!sideNumber) return false;
    ops.push({
      op: 'setSideLineUp',
      matchUpId: loser.matchUpId,
      sideNumber,
      lineUp: lineUps[participantId],
      announcedAs: 'updateSidLineUp',
      // the own dual's line-up writer names no event (`assignedLineUpOps`)
      announcesEvent: false,
    });
  }
  return [...ops, { op: 'stampUpdatedAt', entity: 'matchUp', id: loser.matchUpId }];
}

/**
 * A team an exit's award sends on into a TEAM dual that already sides its drawPosition (a stored side kept there by an
 * earlier unwind): v1's placement writes the team's line-up there, as the draw holds it, through its assignment
 * (`assignTeamLineUp` → `updateSideLineUp`, announced `updateSidLineUp` with neither event nor tournament), after the
 * position. The quiet placement is otherwise the dual's last writer, so the line-up is stated after it (2026-11-19,
 * TEAM SINGLE_ELIMINATION 8/7, walk seed 40: a double exit entered again on a dual its line had undone).
 */
export function quietOnwardLineUps(view: OutcomeView, drawDefinition: DrawDefinition, ops: OutcomeOp[]): OutcomeOp[] {
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  return ops.flatMap((op): OutcomeOp[] => {
    if (op.op !== 'setMatchUpDrawPositions' || op.announcesContext !== false) return [op];
    const target = indexed(view, op.matchUpId);
    if (target?.matchUpType !== 'TEAM') return [op];
    const held = new Set((target.drawPositions ?? []).filter(Boolean));
    const added = (op.drawPositions ?? []).filter((position) => !!position && !held.has(position));
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === target.structureId);
    const assignments = positionAssignmentsOf(structure) ?? [];
    // the hydrated side holds the position (its stored side kept it) but not the team: the draw's assignment names it
    const sided = added.flatMap((position) => {
      const sideNumber = target.sides?.find((candidate) => candidate.drawPosition === position)?.sideNumber;
      const participantId = assignments.find((assignment) => assignment.drawPosition === position)?.participantId;
      return participantId && (sideNumber === 1 || sideNumber === 2) ? [{ sideNumber, participantId }] : [];
    });
    return [
      op,
      ...sided.map(({ sideNumber, participantId }): OutcomeOp => ({
        op: 'setSideLineUp',
        matchUpId: op.matchUpId,
        sideNumber,
        lineUp: lineUps[participantId],
        announcedAs: 'updateSidLineUp',
        announcesEvent: false,
      })),
    ];
  });
}
