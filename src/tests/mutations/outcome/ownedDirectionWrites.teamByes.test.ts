import { findTarget, play, PLAIN_BYE_ARRIVALS, plainByeIsOwned } from '@Tests/testHarness/outcome/directionFixtures';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.teamByes.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

// Prepare TEAM line-ups once: pair participants can receive fresh ids during the public setup.
describe('C20 deciding TEAM lines send their loser through BYEs', () => {
  it.each(PLAIN_BYE_ARRIVALS.filter(([, scenario]) => !!scenario.drawProfile.eventType))('%s', (_label, scenario) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...scenario.drawProfile, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    if (scenario.policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions: scenario.policyDefinitions });
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
    const step = scenario.steps[0];
    for (const singlesLine of [0, 1, 2]) {
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: findTarget({ ...step.target, singlesLine }),
          outcome: step.outcome,
        }).success,
      ).toEqual(true);
    }
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const lineScenario = { ...scenario, steps: [{ ...step, target: { ...step.target, singlesLine: 3 } }] };
    const v1 = play(OUTCOME_PIPELINE_V1, lineScenario, { prepared });
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, lineScenario, { prepared });
    const v2 = play(OUTCOME_PIPELINE_V2, lineScenario, { prepared });
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v2.v1Writes === 0).toEqual(plainByeIsOwned(scenario));
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});
