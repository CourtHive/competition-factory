import { compareDecisions, compareWrites, differentialTally, OutcomePipelineDivergence } from './differential';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getOutcomePipeline } from '@Global/state/globalState';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { findStructure } from '@Acquire/findStructure';
import { observeWrite, planWrite } from './write';
import { planDirection } from './direction';
import { refuseOutcome } from './refusals';
import { buildOutcomeView } from './view';
import { chooseRoute } from './route';

// constants and types
import type { BuildViewArgs, DirectionPlan, OutcomeRequest, OutcomeView, Refusal } from './types';
import { DEAD_RUBBER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
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
      if (!direction) return differentialTally(`${route}:direction`, 'deferred');
      if (direction.produced) checkProducedExit({ args, route, produced: direction.produced });
      if (direction.converged) checkConverged({ args, route, ...direction.converged });
      if (direction.decider) checkDecider({ args, route, ...direction.decider });
      if (direction.loser) checkLoser({ args, route, loser: direction.loser });
      if (direction.winner) checkWinner({ args, route, winner: direction.winner });
      differentialTally(`${route}:direction`, 'compared');
    },
  };
}

type CheckArgs = { args: BuildViewArgs; route: string };

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
}

function checkCarriedExit({
  args,
  route,
  exit,
  target,
  loserSide,
}: CheckArgs & { exit: string; target?: HydratedMatchUp; loserSide?: number }) {
  const opponent = target?.sides?.find((side) => side?.sideNumber !== loserSide);
  // past a BYE the exit moves on to the loser's next matchUp: the cascade's, not checked here
  if (opponent?.bye) return differentialTally(`${route}:loser-exit`, 'deferred');
  const expectedWinner = loserSide === 1 ? 2 : 1;
  if (target?.matchUpStatus !== exit || target?.winningSide !== expectedWinner)
    diverge(
      args,
      `${target?.matchUpId} is ${target?.matchUpStatus} won by side ${target?.winningSide}`,
      `planned ${exit} won by side ${expectedWinner}, the side opposite the loser`,
    );
  differentialTally(`${route}:loser-exit`, 'compared');
}

function checkProducedExit({
  args,
  route,
  produced,
}: CheckArgs & { produced: NonNullable<DirectionPlan['produced']> }) {
  const target = standing(args, produced.matchUpId);
  const opponent = target?.sides?.find((side) => side?.sideNumber === produced.winningSide);
  // a BYE on the other side sends the produced exit on past it: the cascade's, not checked here
  if (opponent?.bye) return differentialTally(`${route}:produced`, 'deferred');
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
}: CheckArgs & { matchUpId: string; matchUpStatus: string }) {
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
}: CheckArgs & { matchUpId: string; matchUpStatus: string }) {
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
  if (!structure?.positionAssignments?.find((assignment) => assignment.drawPosition === bye.drawPosition)?.bye)
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
