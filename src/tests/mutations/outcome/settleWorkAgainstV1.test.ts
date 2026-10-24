import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { tallySettlePredictions } from '@Tests/testHarness/exitPropagation/settlePredictions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';

/**
 * S2's HAS-WORK PREDICATES AGAINST v1's PER-PASS WRITES, end to end (`settlePredictions.ts`, the census's tally).
 *
 * The frozen census window sched-w1 gave 949 predicted calls, every one `s2:local`: no predicted work and no pass of
 * v1's writing. That says nothing about a miss unless a miss can be seen, so this plants one. A stale `scoredTime` on
 * an unscored matchUp is leftover state v1's `reconcileScoredTimes` clears on the next call, whatever it is; a local
 * first-round score is that call. The predicate must say so, and with it silenced the tally must report the miss.
 */
const planted = vi.hoisted(() => ({ silence: false }));

vi.mock('@Mutate/matchUps/outcome/settleWork', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, predictSettleWork: (args: any) => (planted.silence ? [] : actual.predictSettleWork(args)) };
});

beforeEach(() => {
  process.env.SETTLE_PASSES = '1';
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
});

afterEach(() => {
  delete process.env.SETTLE_PASSES;
  planted.silence = false;
  setOutcomePipeline();
});

function scoreFirstRoundOverAStaleStamp() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16, drawId: 'd' }], nonRandom: 1, setState: true });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const later = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (m: any) => m.roundNumber === 3,
  );
  later.schedule = { ...later.schedule, scoredTime: '2026-10-24T12:00:00.000Z' };
  tournamentEngine.setState(tournamentRecord);

  const first = getDrawMatchUps('d').find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
  resetDifferentialTally();
  const observation = observeMutation({ matchUpId: first.matchUpId, outcome: { winningSide: 1 }, drawId: 'd' });
  const counts: Record<string, number> = {};
  tallySettlePredictions(
    observation.settleEvents.map((event: any) => ({ step: 0, ...event })),
    counts,
  );
  return { observation, counts };
}

it('predicts the work v1 then does, and abstains: the stale stamp v1 clears', () => {
  const { observation, counts } = scoreFirstRoundOverAStaleStamp();
  expect(observation.thrown).toBeUndefined();
  expect(observation.mutated).toEqual(true);
  // CONTROL: a prediction was made for the call, and v1's pass wrote what it predicted
  expect(counts['s2:predicted-call']).toEqual(1);
  expect(counts['s2:missed:reconcileScoredTimes']).toBeUndefined();
  // S2's rule: a call that leaves a pass work is not v2's to own, so the plan abstains before the shadow
  expect(getDifferentialTally()['shadow:abstain:settle']).toEqual({ compared: 0, deferred: 1 });
});

it('is a divergence the shadow catches when the prediction is silenced', () => {
  planted.silence = true;
  const { observation, counts } = scoreFirstRoundOverAStaleStamp();
  expect(counts['s2:missed:reconcileScoredTimes']).toEqual(1);
  expect(String(observation.thrown)).toMatch(/scoredTime = absent, v2 shadow-applied/);
});
