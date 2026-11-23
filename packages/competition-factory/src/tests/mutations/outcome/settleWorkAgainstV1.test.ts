import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { tallySettlePredictions } from '@Tests/testHarness/exitPropagation/settlePredictions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';

/** The completed v2 cleanup owns the call; a faulty shadow deletion must still be detected independently. */
const planted = vi.hoisted(() => ({ omitCleanup: false }));
vi.mock('@Mutate/matchUps/outcome/shadow', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    compareShadow: (args: any) =>
      actual.compareShadow({
        ...args,
        ops: planted.omitCleanup ? args.ops.filter((op: any) => op.op !== 'clearMatchUpScoredTime') : args.ops,
      }),
  };
});

beforeEach(() => {
  process.env.SETTLE_PASSES = '1';
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
});

afterEach(() => {
  delete process.env.SETTLE_PASSES;
  planted.omitCleanup = false;
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

it('plans and owns the final stale-time cleanup that v1 performs', () => {
  const { observation, counts } = scoreFirstRoundOverAStaleStamp();
  expect(observation.thrown).toBeUndefined();
  expect(observation.mutated).toEqual(true);
  // CONTROL: a prediction was made for the call, and v1's pass wrote what it predicted
  expect(counts['s2:predicted-call']).toEqual(1);
  expect(counts['s2:missed:reconcileScoredTimes']).toBeUndefined();
  expect(getDifferentialTally()['shadow:abstain:settle']).toBeUndefined();
  expect(getDifferentialTally()['shadow:applied']).toEqual({ compared: 1, deferred: 0 });
});

it('catches a missing cleanup in the shadow independently of v1 and the planner', () => {
  planted.omitCleanup = true;
  const { observation, counts } = scoreFirstRoundOverAStaleStamp();
  expect(counts['s2:missed:reconcileScoredTimes']).toBeUndefined();
  expect(String(observation.thrown)).toMatch(/scoredTime = absent, v2 shadow-applied/);
});
