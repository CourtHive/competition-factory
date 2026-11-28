import { setSubscriptions } from '@Global/state/globalState';
import { getOutcomePipeline, setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_V1 } from '@Tests/testHarness/outcomeModes';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Tests/testHarness/outcomeModes';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';

/**
 * A SETTLE LOOP AT ITS BOUND REFUSES (F9 (i)).
 *
 * Four bounded loops used to stop at their pass limit and report success. Each now asks once more whether work is left
 * and, only if it is, refuses with `SETTLE_BOUND_REACHED` naming itself. None was reached on ~97,000 census schedules
 * (settle telemetry, 2026-10-24), so each is planted: the loop's limit is lowered to 0 for one call that has real work
 * at that loop, found by playing a draw forward and trying each step at the lowered limit. Every step before it, at
 * the production limit, succeeds; and at limit 0 a step with nothing for that loop to do still succeeds, which is the
 * recheck working (measured: of 358 exitPropagation files at each limit 0, 133 to 332 still pass).
 *
 * The forward settle keeps its `FORWARD_SETTLE_EXHAUSTED` warning (`aForwardSettleStoppedAtItsBoundSaysSo`), F9's one
 * exception.
 */
type Site = keyof typeof SETTLE_PASS_LIMITS;

/**
 * One call at `site`'s lowered limit, under v1 by default: under `differential` the planted refusal is a divergence (v1
 * refused, v2 planned the success) and the call throws, which the last case below asserts once.
 */
function atLimitZero(site: Site, enter: () => any, pipeline: OutcomePipelineMode = OUTCOME_PIPELINE_V1) {
  const saved = SETTLE_PASS_LIMITS[site];
  const savedPipeline = getOutcomePipeline();
  SETTLE_PASS_LIMITS[site] = 0;
  setOutcomePipeline(pipeline);
  try {
    return enter();
  } finally {
    SETTLE_PASS_LIMITS[site] = saved;
    setOutcomePipeline(savedPipeline);
  }
}

/**
 * DOUBLE_ELIMINATION 16/11, seed 21138954 (`aProducedConvergenceCrossesTheLinkItReaches`): the last step's double
 * walkover produces a stranded convergence, whose exit then crosses the Backdraw final's winner link through a BYE.
 */
describe.each([
  { site: 'strandedConvergences' as Site, loop: 'produceStrandedConvergences' },
  { site: 'linkCrossings' as Site, loop: 'crossLinksThroughByes' },
])('$loop', ({ site, loop }) => {
  const at = (key: string, outcome: any) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  };
  const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 11,
    seed: 21138954,
    drawSize: 16,
  };
  const steps = [
    at('Main|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|3|2', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|1|4', { winningSide: 2 }),
    at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
  ];
  const produce = at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER });

  it('refuses with SETTLE_BOUND_REACHED, naming itself, when its bound is reached with work left', () => {
    setSubscriptions({});
    expect(prepareDraw(config, 'de')).toEqual(true);
    for (const step of steps) {
      const target = getDrawMatchUps('de').find((matchUp: any) => coordinate(matchUp) === coordinate(step));
      const observed = observeMutation({
        propagateExitStatus: true,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId: 'de',
      });
      // CONTROL: the schedule is accepted at the production limits
      expect(observed.mutated).toEqual(true);
    }
    const target = getDrawMatchUps('de').find((matchUp: any) => coordinate(matchUp) === coordinate(produce));
    const refused: any = atLimitZero(site, () =>
      tournamentEngine.setMatchUpStatus({
        matchUpId: target.matchUpId,
        outcome: produce.outcome,
        propagateExitStatus: true,
        drawId: 'de',
      }),
    );
    expect(refused.error).toEqual(SETTLE_BOUND_REACHED);
    expect(refused.info).toEqual(loop);
  });
});
