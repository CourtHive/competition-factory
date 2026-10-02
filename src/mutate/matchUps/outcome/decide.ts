import { compareDecisions, compareWrites, differentialTally, OutcomePipelineDivergence } from './differential';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getOutcomePipeline } from '@Global/state/globalState';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { observeWrite, planWrite } from './write';
import { planDirection } from './direction';
import { refuseOutcome } from './refusals';
import { buildOutcomeView } from './view';
import { chooseRoute } from './route';

// constants and types
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import type { BuildViewArgs, Refusal } from './types';
import type { ResultType } from '@Types/factoryTypes';

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
  const route = refusal ? undefined : chooseRoute(args.request, view);
  const plan = route ? planWrite(args.request, view, route) : undefined;
  const direction = route ? planDirection(args.request, view, route) : undefined;

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

      // § 5 rule 1: the winner stands in the matchUp direction names, and the loser where its link says
      if (!direction) return differentialTally(`${route}:direction`, 'deferred');
      if (direction.loser) {
        const { matchUps } = getAllDrawMatchUps({
          matchUpFilters: { matchUpIds: [direction.loser.matchUpId] },
          tournamentRecord: args.tournamentRecord,
          drawDefinition: args.drawDefinition,
          inContext: true,
          event: args.event,
        });
        const present = !!matchUps?.[0]?.sides?.some((side) => side?.participantId === direction.loser?.participantId);
        if (present !== direction.loser.arrives)
          throw new OutcomePipelineDivergence({
            matchUpId: args.request.matchUpId,
            v1: `loser ${direction.loser.participantId} ${present ? 'is' : 'is not'} in ${direction.loser.matchUpId}`,
            v2: `planned the loser ${direction.loser.arrives ? 'into' : 'out of'} ${direction.loser.matchUpId}`,
          });
        differentialTally(`${route}:loser-${direction.loser.arrives ? 'in' : 'out'}`, 'compared');
      }
      if (!direction.winner) return differentialTally(`${route}:direction`, 'compared');
      const { matchUps } = getAllDrawMatchUps({
        matchUpFilters: { matchUpIds: [direction.winner.matchUpId] },
        tournamentRecord: args.tournamentRecord,
        drawDefinition: args.drawDefinition,
        inContext: true,
        event: args.event,
      });
      const target = matchUps?.[0];
      const arrived = !!target?.sides?.some((side) => side?.participantId === direction.winner?.participantId);
      if (!arrived)
        throw new OutcomePipelineDivergence({
          matchUpId: args.request.matchUpId,
          v1: `winner ${direction.winner.participantId} not in ${direction.winner.matchUpId}`,
          v2: `planned the winner into ${direction.winner.matchUpId}`,
        });
      differentialTally(`${route}:direction`, 'compared');
    },
  };
}

function toResult(refusal: Refusal): ResultType {
  return {
    error: refusal.error,
    ...(refusal.info ? { info: refusal.info } : {}),
    ...(refusal.context ? { context: refusal.context } : {}),
  };
}
