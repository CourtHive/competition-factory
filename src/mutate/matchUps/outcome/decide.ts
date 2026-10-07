import { compareDecisions, compareWrites, differentialTally, OutcomePipelineDivergence } from './differential';
import { carriedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { convergence, isRelabel, planDirection } from './direction';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getOutcomePipeline } from '@Global/state/globalState';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { findStructure } from '@Acquire/findStructure';
import { observeWrite, planWrite } from './write';
import { refuseOutcome } from './refusals';
import { buildOutcomeView } from './view';
import { chooseRoute } from './route';

// constants and types
import type { BuildViewArgs, DirectionPlan, OutcomeRequest, OutcomeView, Refusal, WithdrawnCarry } from './types';
import { BYE, DEAD_RUBBER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * The routing point. Under `v1` nothing is built and nothing is decided. Under `v2` a refusal is
 * returned as the result the entry hands back, shaped as every other refusal is (`error`, `info`,
 * `context`). Under `differential` the refusal is kept, v1 runs, and `compare` throws
 * `OutcomePipelineDivergence` if the two answers differ on anything but an apply-stage code.
 */
export function decideOutcomeV2(args: BuildViewArgs): {
  refused?: ResultType;
  compare?: (v1Result: ResultType) => void;
} {
  const mode = getOutcomePipeline();
  if (mode === OUTCOME_PIPELINE_V1) return {};

  const view = buildOutcomeView(args);
  const refusal: Refusal | undefined = refuseOutcome(args.request, view);

  if (mode === OUTCOME_PIPELINE_V2 && refusal) return { refused: toResult(refusal) };
  if (mode !== OUTCOME_PIPELINE_DIFFERENTIAL) return {};

  // S2b: the route and the write on this matchUp, planned BEFORE v1 runs, checked against it after
  // TEAM auto-calc: a dual whose result is computed from its lines takes the PROJECTED winner and score in
  // place of the call's before anything is routed, as `handleTeamAutoCalc` rewrites v1's parameters
  const planned = autoCalculated(args.request, view);
  const route = refusal ? undefined : chooseRoute(planned, view);
  const plan = route ? planWrite(planned, view, route) : undefined;
  const direction = route ? planDirection(planned, view, route) : undefined;
  const dual = route ? planDual(args, view) : undefined;

  return {
    compare: (v1Result) => {
      const comparison = compareDecisions(refusal, v1Result?.error?.code);
      if (!comparison.agree)
        throw new OutcomePipelineDivergence({
          matchUpId: args.request.matchUpId,
          v1: comparison.v1,
          v2: comparison.v2,
        });
      if (refusal || v1Result?.error) return differentialTally('refusal', refusal ? 'compared' : 'deferred');
      checkNoExitBesideBye({ args, route: route ?? 'none' });
      if (!route || !plan || !args.drawDefinition) return differentialTally(route ?? 'none', 'deferred');

      const { matchUp } = findDrawMatchUp({
        drawDefinition: args.drawDefinition,
        matchUpId: args.request.matchUpId as string,
        event: args.event,
      });
      if (!matchUp) return differentialTally(route, 'deferred');
      const written = compareWrites(plan, observeWrite(matchUp));
      if (!written.agree)
        throw new OutcomePipelineDivergence({
          matchUpId: args.request.matchUpId,
          v1: `wrote ${written.v1}`,
          v2: `planned ${written.v2} on route ${route}`,
        });
      differentialTally(route, 'compared');
      if (planned !== args.request) differentialTally('team-autocalc', 'compared');

      // § 5 rule 1: the winner stands in the matchUp direction names, and the loser where its link says
      if (dual) checkDual({ args, route, dual });
      if (route === 'winner' && isExit(planned.matchUpStatus) && isRelabel(planned, view))
        differentialTally('winner:relabel-exit', direction?.loser?.exit ? 'compared' : 'deferred');
      if (!direction) return differentialTally(`${route}:direction`, 'deferred');
      checkDirection({ args, route, direction });
      differentialTally(`${route}:direction`, 'compared');
      if (planned !== args.request) differentialTally('team-autocalc:direction', 'compared');
    },
  };
}

type CheckArgs = { args: BuildViewArgs; route: string };
type DualPlan = { matchUpId: string; winningSide: 1 | 2; direction?: DirectionPlan };

/**
 * A line whose projection decides its dual: v1 writes the projected winner onto the dual and directs
 * it as any winner is directed. The dual's direction is planned from a view of the dual, before v1 runs.
 * Not planned when the dual is overridden by hand (`disableAutoCalc`) or the projection decides nothing.
 */
function planDual(args: BuildViewArgs, view: OutcomeView): DualPlan | undefined {
  const line = view.line;
  const winningSide = line?.projectedWinningSide;
  if (!line || line.autoCalcDisabled || (winningSide !== 1 && winningSide !== 2)) return undefined;
  const request: OutcomeRequest = {
    flags: { ...args.request.flags, enableAutoCalc: false },
    matchUpId: line.dualMatchUpId,
    winningSide,
  };
  const dualView = buildOutcomeView({ ...args, request });
  return { matchUpId: line.dualMatchUpId, winningSide, direction: planDirection(request, dualView, 'winner') };
}

function checkDual({ args, route, dual }: CheckArgs & { dual: DualPlan }) {
  const stored = standing(args, dual.matchUpId);
  if (stored?.winningSide !== dual.winningSide)
    diverge(
      args,
      `dual ${dual.matchUpId} winningSide ${stored?.winningSide}`,
      `planned the dual's projected winningSide ${dual.winningSide}`,
    );
  differentialTally(`${route}:dual`, 'compared');
  if (!dual.direction) return differentialTally(`${route}:dual-direction`, 'deferred');
  checkDirection({ args, route: `${route}:dual`, direction: dual.direction });
  differentialTally(`${route}:dual-direction`, 'compared');
}

function checkDirection({ args, route, direction }: CheckArgs & { direction: DirectionPlan }) {
  if (direction.produced) checkProducedExit({ args, route, produced: direction.produced });
  if (direction.converged) checkConverged({ args, route, ...direction.converged });
  if (direction.decider) checkDecider({ args, route, ...direction.decider });
  if (direction.loser) checkLoser({ args, route, loser: direction.loser });
  if (direction.winner) checkWinner({ args, route, winner: direction.winner });
}

/** a feeder of `target` other than the request's own matchUp holds a BYE and a carried exit, with nobody in it */
function opponentFeederHoldsAnExit(args: BuildViewArgs, target: HydratedMatchUp, excludeMatchUpId: string): boolean {
  const matchUps =
    getAllDrawMatchUps({
      tournamentRecord: args.tournamentRecord,
      drawDefinition: args.drawDefinition,
      inContext: true,
      event: args.event,
    }).matchUps ?? [];
  return matchUps.some(
    (feeder) =>
      feeder.matchUpId !== excludeMatchUpId &&
      feeder.matchUpId !== args.request.matchUpId &&
      (feeder.winnerMatchUpId === target.matchUpId || feeder.loserMatchUpId === target.matchUpId) &&
      !!feeder.sides?.some((side) => side?.bye) &&
      !feeder.sides?.some((side) => side?.participantId) &&
      Object.values(feeder.sideExitProvenance ?? {}).some((entry) => !!carriedExitStatus(entry)),
  );
}

/** one matchUp of the draw as it stands after v1 ran, in context */
function standing(args: BuildViewArgs, matchUpId: string) {
  return getAllDrawMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    inContext: true,
    event: args.event,
  }).matchUps?.[0];
}

function diverge(args: BuildViewArgs, v1: string, v2: string): never {
  throw new OutcomePipelineDivergence({ matchUpId: args.request.matchUpId, v1, v2 });
}

function checkWinner({ args, winner }: CheckArgs & { winner: NonNullable<DirectionPlan['winner']> }) {
  const target = standing(args, winner.matchUpId);
  if (!target?.sides?.some((side) => side?.participantId === winner.participantId))
    diverge(
      args,
      `winner ${winner.participantId} not in ${winner.matchUpId}`,
      `planned the winner into ${winner.matchUpId}`,
    );
}

function checkLoser({ args, route, loser }: CheckArgs & { loser: NonNullable<DirectionPlan['loser']> }) {
  const target = standing(args, loser.matchUpId);
  const loserSide = target?.sides?.find((side) => side?.participantId === loser.participantId)?.sideNumber;
  const present = !!loserSide;
  if (present !== loser.arrives)
    diverge(
      args,
      `loser ${loser.participantId} ${present ? 'is' : 'is not'} in ${loser.matchUpId}`,
      `planned the loser ${loser.arrives ? 'into' : 'out of'} ${loser.matchUpId}`,
    );
  differentialTally(`${route}:loser-${loser.arrives ? 'in' : 'out'}`, 'compared');
  if (loser.exit && present) checkCarriedExit({ args, route, exit: loser.exit, target, loserSide });
  if (loser.converged && present)
    checkConverged({ args, route, matchUpId: loser.matchUpId, matchUpStatus: loser.converged });
  if (loser.bye) checkPropagatedBye({ args, route, bye: loser.bye });
  if (loser.withdrawn && present) checkWithdrawnCarry({ args, route, withdrawn: loser.withdrawn, target, loserSide });
}

/**
 * F2: the relabel withdrew the exit this matchUp carried to the loser. Where v1 kept it, a result stands onward (the
 * loser or the carry's winner played on), which the view does not read: deferred. Otherwise the loser's matchUp is
 * undecided, or, where the carry had converged, the other origin's exit won by the loser.
 */
function checkWithdrawnCarry({
  args,
  route,
  withdrawn,
  target,
  loserSide,
}: CheckArgs & { withdrawn: WithdrawnCarry; target?: HydratedMatchUp; loserSide?: number }) {
  const kept = Object.values(target?.sideExitProvenance ?? {}).some(
    (entry) => entry?.sourceMatchUpId === args.request.matchUpId && !!carriedExitStatus(entry),
  );
  if (kept) return differentialTally(`${route}:loser-withdrawal-kept`, 'deferred');
  const winningSide = withdrawn.loserWins ? loserSide : undefined;
  const winner = winningSide ? ` won by the loser, side ${winningSide}` : '';
  if (target?.matchUpStatus !== withdrawn.matchUpStatus || target?.winningSide !== winningSide)
    diverge(
      args,
      `${target?.matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned the carry withdrawn: ${withdrawn.matchUpStatus}${winner}`,
    );
  differentialTally(`${route}:loser-withdrawn${withdrawn.loserWins ? '-converged' : ''}`, 'compared');
}

function checkCarriedExit({
  args,
  route,
  exit,
  target,
  loserSide,
}: CheckArgs & { exit: string; target?: HydratedMatchUp; loserSide?: number }) {
  const opponent = target?.sides?.find((side) => side?.sideNumber !== loserSide);
  if (opponent?.bye) return checkCarriedPastBye({ args, route, exit, holder: target, loserSide });
  const expectedWinner = loserSide === 1 ? 2 : 1;
  if (target?.matchUpStatus !== exit || target?.winningSide !== expectedWinner)
    diverge(
      args,
      `${target?.matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned ${exit} won by side ${expectedWinner}, the side opposite the loser`,
    );
  differentialTally(`${route}:loser-exit`, 'compared');
}

/**
 * A carried exit that meets a BYE (exit-propagation § propagateExitStatus, RULE 1): the holder stays a BYE
 * with no winner, and the loser goes on to the holder's winner matchUp carrying the exit, where it is
 * awarded to the side opposite them. A holder with no winner matchUp keeps the loser. Deferred: a second
 * BYE onward (the exit passes again) and an exit standing on the onward side, whose convergence v1 cannot
 * always write (see the tally `loser-exit-past-bye-meets-exit`).
 */
function checkCarriedPastBye({
  args,
  route,
  exit,
  holder,
  loserSide,
}: CheckArgs & { exit: string; holder?: HydratedMatchUp; loserSide?: number }) {
  if (!holder || !args.drawDefinition) return differentialTally(`${route}:loser-exit-past-bye`, 'deferred');
  if (holder.matchUpStatus !== BYE || holder.winningSide)
    diverge(
      args,
      `${holder.matchUpId} is ${holder.matchUpStatus} won by side ${holder.winningSide}`,
      `planned the holder a BYE with no winner, the exit sent on past it`,
    );
  const loserId = holder.sides?.find((side) => side?.sideNumber === loserSide)?.participantId;
  const onward = onwardMatchUp(args, holder);
  if (!onward) return differentialTally(`${route}:loser-exit-past-bye-final`, 'compared');
  const onwardId = onward.matchUpId;
  const onwardSide = onward?.sides?.find((side) => side?.participantId === loserId)?.sideNumber;
  if (!onwardSide) diverge(args, `loser ${loserId} not in ${onwardId}`, `planned the loser on past the BYE into it`);
  // by NUMBER: a side nobody has reached is an in-context `{}` with no sideNumber, and a pending exit
  // produced there by a double exit holds no drawPosition, so only its provenance says it stands (a BYE
  // claimed there is not an exit)
  const otherSide = 3 - (onwardSide ?? 0);
  const other = onward?.sides?.find((side) => side?.sideNumber === otherSide);
  if (other?.bye) return differentialTally(`${route}:loser-exit-past-bye-again`, 'deferred');
  const standingExit = onward?.sideExitProvenance?.[otherSide]?.matchUpStatus;
  if (standingExit && standingExit !== BYE)
    return checkPastByeConvergence({ args, route, exit, standingExit, onward, loserId });
  const expectedWinner = onwardSide === 1 ? 2 : 1;
  if (onward?.matchUpStatus !== exit || onward?.winningSide !== expectedWinner)
    diverge(
      args,
      `${onwardId} is ${onward?.matchUpStatus} won by side ${onward?.winningSide}`,
      `planned ${exit} won by side ${expectedWinner}, opposite the loser who passed the BYE`,
    );
  differentialTally(`${route}:loser-exit-past-bye`, 'compared');
}

/**
 * The exit carried past a BYE meets one already standing on the other side: they converge, and nobody
 * wins. A loser advanced on as the onward matchUp's winner is a divergence. It was deferred as a known v1
 * defect (2026-10-02: the convergence write that should retract them was refused and dropped); since
 * #5156 that refusal is returned, and a whole-suite differential run reached the shape 0 times
 * (2026-10-04), so it fails loudly if it returns.
 */
function checkPastByeConvergence({
  args,
  route,
  exit,
  standingExit,
  onward,
  loserId,
}: CheckArgs & { exit: string; standingExit: string; onward?: HydratedMatchUp; loserId?: string }) {
  const expected = convergence([exit, standingExit]);
  if (onward?.matchUpStatus === expected && !onward?.winningSide)
    return differentialTally(`${route}:loser-exit-past-bye-converged`, 'compared');
  const advancedOn = onward?.winningSide && onward.sides?.find((side) => side?.participantId === loserId)?.sideNumber;
  if (advancedOn === onward?.winningSide)
    diverge(
      args,
      `loser ${loserId} advanced on as ${onward?.matchUpId}'s winner`,
      `planned ${expected}, the carried ${exit} converging with the standing ${standingExit}`,
    );
  diverge(
    args,
    `${onward?.matchUpId} is ${onward?.matchUpStatus} won by side ${onward?.winningSide}`,
    `planned ${expected}, the carried ${exit} meeting the standing ${standingExit}`,
  );
}

/** the matchUp a holder's winner goes on to, read from the draw's links rather than from who is in it */
function onwardMatchUp(args: BuildViewArgs, holder: HydratedMatchUp): HydratedMatchUp | undefined {
  if (!args.drawDefinition) return undefined;
  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    inContext: true,
    event: args.event,
  }).matchUps;
  const onwardId = positionTargets({
    drawDefinition: args.drawDefinition,
    matchUpId: holder.matchUpId,
    inContextMatchUp: holder,
    inContextDrawMatchUps,
  }).targetMatchUps?.winnerMatchUp?.matchUpId;
  return onwardId ? standing(args, onwardId) : undefined;
}

/**
 * A produced exit that meets a BYE (CA 2026-09-29, `heldExitIsSentOn.test.ts`): the holder stays a BYE
 * with no winner and the exit is sent on, keeping its flavour, to the holder's winner matchUp. There it
 * is a produced exit like any other: awarded to an opponent already in place, pending (no winningSide)
 * while the other side is empty (a fed slot nobody has reached yet included: CA 2026-10-03, Q3),
 * converged with an exit standing there. Deferred: a second BYE onward.
 */
function checkProducedPastBye({
  args,
  route,
  produced,
  holder,
}: CheckArgs & { produced: NonNullable<DirectionPlan['produced']>; holder?: HydratedMatchUp }) {
  if (!holder) return differentialTally(`${route}:produced-past-bye`, 'deferred');
  if (holder.matchUpStatus !== BYE || holder.winningSide)
    diverge(
      args,
      `${holder.matchUpId} is ${holder.matchUpStatus} won by side ${holder.winningSide}`,
      `planned the holder a BYE with no winner, the produced exit sent on past it`,
    );
  const onward = onwardMatchUp(args, holder);
  if (!onward) return differentialTally(`${route}:produced-past-bye-final`, 'compared');
  const provenance = onward.sideExitProvenance ?? {};
  // the side the produced exit landed on: the entry naming THIS double exit as its source, else the entry that
  // reads as it (a participant's own entry can name an exit too, the walkover they WON on the way here)
  const exitSide =
    [1, 2].find((side) => provenance[side]?.sourceMatchUpId === args.request.matchUpId) ??
    [1, 2].find(
      (side) =>
        provenance[side]?.matchUpStatus === produced.matchUpStatus &&
        isDoubleExit(provenance[side]?.previousMatchUpStatus),
    );
  if (!exitSide)
    diverge(
      args,
      `${onward.matchUpId} holds no ${produced.matchUpStatus}`,
      `planned the produced exit sent on into it`,
    );
  // by number throughout: an in-context side not yet reached is an empty object with no sideNumber at all, and
  // reading the standing exit through it missed a WALKOVER another double exit had produced there (the
  // `doubleExitAdvancement` BYE-meets-WALKOVER cell under the differential, 7.7.0 checkpoint: v1 converged,
  // the check expected the exit pending)
  const otherSide = 3 - (exitSide ?? 0);
  const other = onward.sides?.find((side) => side?.sideNumber === otherSide);
  if (other?.bye) return differentialTally(`${route}:produced-past-bye-again`, 'deferred');
  const standingExit = carriedExitStatus(provenance[otherSide]);
  const expectedStatus = standingExit ? convergence([produced.matchUpStatus, standingExit]) : produced.matchUpStatus;
  const expectedWinner = expectedStatus === produced.matchUpStatus && other?.participantId ? otherSide : undefined;
  if (onward.matchUpStatus === expectedStatus && onward.winningSide === expectedWinner)
    return differentialTally(`${route}:produced-past-bye-${expectedWinner ? 'awarded' : 'pending'}`, 'compared');
  diverge(
    args,
    `${onward.matchUpId} is ${onward.matchUpStatus} won by side ${onward.winningSide}`,
    `planned ${expectedStatus} won by side ${expectedWinner ?? 'none (pending)'}, the produced exit sent on`,
  );
}

function checkProducedExit({
  args,
  route,
  produced,
}: CheckArgs & { produced: NonNullable<DirectionPlan['produced']> }) {
  const target = standing(args, produced.matchUpId);
  const opponent = target?.sides?.find((side) => side?.sideNumber === produced.winningSide);
  if (opponent?.bye) return checkProducedPastBye({ args, route, produced, holder: target });
  // the opponent's seat is fed by a BYE holder holding an exit nobody can take: v1 sends that exit on at the end of
  // the call (CA, 2026-10-04, "BYE holder, exit sent on"), and the two exits converge here. Not planned: deferred
  if (target && opponentFeederHoldsAnExit(args, target, produced.matchUpId))
    return differentialTally(`${route}:produced-meets-held-exit`, 'deferred');
  // CA, 2026-09-20: a produced exit holds NO winningSide until the opponent arrives; the exception
  // (2026-09-25) is an opponent already in place, whose side the winner is read off
  const expectedWinner = opponent?.participantId ? produced.winningSide : undefined;
  if (target?.matchUpStatus !== produced.matchUpStatus || target?.winningSide !== expectedWinner)
    diverge(
      args,
      `${produced.matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned the produced ${produced.matchUpStatus} won by side ${expectedWinner ?? 'none (pending)'}`,
    );
  differentialTally(`${route}:produced-${expectedWinner ? 'awarded' : 'pending'}`, 'compared');
}

/**
 * An invariant, asked after every accepted call (CA, 2026-10-02; fixed in v1 by #5118): an exit that
 * meets a BYE leaves a BYE behind. No matchUp may end labelled WALKOVER or DEFAULTED with a BYE on one
 * side and nobody on the other; the exit has always moved on from such a matchUp, and the label is a
 * defect wherever it comes from. Checked across the whole draw, not only what this call planned.
 */
function checkNoExitBesideBye({ args, route }: CheckArgs) {
  const matchUps =
    getAllDrawMatchUps({
      tournamentRecord: args.tournamentRecord,
      drawDefinition: args.drawDefinition,
      inContext: true,
      event: args.event,
    }).matchUps ?? [];
  const offenders = matchUps.filter(
    (m) =>
      isExitLabel(m.matchUpStatus) &&
      !!m.winnerMatchUpId &&
      !m.collectionId &&
      !!m.sides?.some((side) => side?.bye) &&
      !m.sides?.some((side) => side?.participantId),
  );
  if (offenders.length)
    diverge(
      args,
      `left ${offenders.map(describeHolder).join(', ')} beside a BYE`,
      'no exit label beside a BYE with nobody in it (it should read BYE)',
    );
  differentialTally(`${route}:invariant-exit-beside-bye`, 'compared');
}

const isExitLabel = (status?: string) => status === WALKOVER || status === DEFAULTED;

const describeHolder = (m: HydratedMatchUp) =>
  [m.structureName, m.roundNumber, m.roundPosition].join('|') + ' ' + m.matchUpStatus;

/** spec § 5 effect 5: the decider stands TO_BE_PLAYED when needed and a DEAD_RUBBER when not, with no result */
function checkDecider({
  args,
  route,
  matchUpId,
  matchUpStatus,
}: CheckArgs & { matchUpId: string; matchUpStatus: MatchUpStatusUnion }) {
  const target = standing(args, matchUpId);
  if (target?.matchUpStatus !== matchUpStatus || target?.winningSide)
    diverge(
      args,
      `decider ${matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned the decider ${matchUpStatus} with no result`,
    );
  differentialTally(`${route}:decider-${matchUpStatus === DEAD_RUBBER ? 'dead' : 'needed'}`, 'compared');
}

/** exit-propagation § convergence: two exits on one matchUp make a double exit, with no winner */
function checkConverged({
  args,
  route,
  matchUpId,
  matchUpStatus,
}: CheckArgs & { matchUpId: string; matchUpStatus: MatchUpStatusUnion }) {
  const target = standing(args, matchUpId);
  if (target?.sides?.some((side) => side?.bye)) return differentialTally(`${route}:converged`, 'deferred');
  if (target?.matchUpStatus !== matchUpStatus || target?.winningSide)
    diverge(
      args,
      `${matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned the convergence ${matchUpStatus} with no winner`,
    );
  differentialTally(`${route}:converged`, 'compared');
}

function checkPropagatedBye({ args, route, bye }: CheckArgs & { bye: { structureId: string; drawPosition: number } }) {
  if (!args.drawDefinition) return;
  const { structure } = findStructure({ drawDefinition: args.drawDefinition, structureId: bye.structureId });
  if (!positionAssignmentsOf(structure)?.find((assignment) => assignment.drawPosition === bye.drawPosition)?.bye)
    diverge(
      args,
      `no BYE at drawPosition ${bye.drawPosition} of ${bye.structureId}`,
      'planned a propagated BYE there for the kept-out loser',
    );
  differentialTally(`${route}:loser-out-bye`, 'compared');
}

function autoCalculated(request: OutcomeRequest, view: OutcomeView): OutcomeRequest {
  if (!view.isTeam || !request.flags.enableAutoCalc || !view.dualProjection) return request;
  return { ...request, winningSide: view.dualProjection.projectedWinningSide, score: view.dualProjection.score };
}

function toResult(refusal: Refusal): ResultType {
  return {
    error: refusal.error,
    ...(refusal.info ? { info: refusal.info } : {}),
    ...(refusal.context ? { context: refusal.context } : {}),
  };
}
