import { getDifferentialTally, OutcomePipelineDivergence, resetDifferentialTally } from '@Mutate/matchUps/outcome';
import { authoredScenarios } from '../../testHarness/corpus/authoredSources';
import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';

/**
 * S2b: the v2 routes (§ 3), the write on the matchUp itself (§ 4) and the winner's direction
 * (§ 5 rule 1), planned before v1 runs and compared with what v1 left.
 *
 * A green differential run that compared nothing proves nothing, which is exactly how the first
 * S2b run went green: the comparison was never wired. So this asserts what WAS compared, by route.
 */
afterEach(() => setOutcomePipeline());

it('every accepted authored step is planned, written as planned, and its winner lands where direction says', () => {
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  resetDifferentialTally();
  const divergences: string[] = [];
  for (const scenario of authoredScenarios()) {
    tournamentEngine.reset();
    tournamentEngine.setState(scenario.initialRecord);
    for (const directive of scenario.directives) {
      const result: any = tournamentEngine.executionQueue([directive]);
      const message = String(result?.error?.message ?? result?.error ?? '');
      if (message.includes('outcome pipeline divergence')) divergences.push(`${scenario.scenarioId}: ${message}`);
    }
  }
  expect(divergences).toEqual([]);

  const tally = getDifferentialTally();
  const compared = (route: string) => tally[route]?.compared ?? 0;
  expect(compared('refusal')).toBeGreaterThan(0);
  expect(compared('winner')).toBeGreaterThan(0);
  expect(compared('winner:direction')).toBeGreaterThan(0);
  // S2c: the loser's destination, from the same authored draws (FMLC feeds among them)
  expect(compared('winner:loser-in')).toBeGreaterThan(0);
  // a loser with a prior win is kept out of the FMLC feed and a propagated BYE takes the place
  expect(compared('winner:loser-out')).toBeGreaterThan(0);
  expect(compared('winner:loser-out-bye')).toEqual(compared('winner:loser-out'));
  // with propagation on, the loser carries the exit into the target, which the side opposite wins
  expect(compared('winner:loser-exit')).toBeGreaterThan(0);
  // a double exit produces an exit in the matchUp it feeds, pending (no winner) until someone arrives
  expect(compared('double-exit:produced-pending')).toBeGreaterThan(0);
  // two double exits meeting on one matchUp converge into a double exit (authored: double-exits-converge)
  expect(compared('double-exit:converged')).toBeGreaterThan(0);
  // a double exit over a completed result: the double default keeps the score, the double walkover blanks it
  expect(compared('completed-to-double-exit')).toBeGreaterThan(0);
  expect(compared('double-exit') + compared('noop')).toBeGreaterThan(0);
  // the swap (allowChangePropagation with a new winner): written in place, and both paths exchanged
  expect(compared('swap')).toBeGreaterThan(0);
  expect(compared('swap:direction')).toEqual(compared('swap'));
});

it('a divergence names the matchUp and both writes', () => {
  const divergence = new OutcomePipelineDivergence({
    matchUpId: 'm1',
    v1: 'wrote {"winningSide":1}',
    v2: 'planned {"winningSide":2} on route winner',
  });
  expect(divergence.message).toContain('m1');
  expect(divergence.message).toContain('on route winner');
});
