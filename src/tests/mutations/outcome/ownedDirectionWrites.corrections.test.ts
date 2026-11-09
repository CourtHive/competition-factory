import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  play,
  compareUndirectedWinner,
  HELD_CARRY_CASES,
  prepareHeldCarryCorrection,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { COMPASS, FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { HeldCarryCorrection } from '@Tests/testHarness/outcome/directionFixtures';
import { COMPLETED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.corrections.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C25 existing carries corrected past held BYEs preserve records, returns and ordered notices', () => {
  it.each(HELD_CARRY_CASES)('%s', (_label, profile, correction, policyOff) => {
    const { prepared, scenario } = prepareHeldCarryCorrection(profile, correction, policyOff);
    if (profile.drawType === FIRST_MATCH_LOSER_CONSOLATION && correction.entered === WALKOVER) {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
      expect(v1.results[0].error?.code).toEqual('ERR_CANNOT_CHANGE_FEED_ELIGIBILITY');
      for (const mode of [OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V2] as const) {
        const actual = play(mode, scenario, { prepared });
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    } else {
      // Captured controls: COMPASS 16/15 carries across another loser link; DOUBLES 16/11 also withdraws a downstream BYE.
      const deeper =
        profile.drawType === COMPASS &&
        profile.drawSize === 16 &&
        (profile.participantsCount === 15 || profile.eventType === 'DOUBLES');
      const owned = profile.eventType !== 'TEAM' && (!deeper || !!correction.sourceOnly);
      expect(compareUndirectedWinner(scenario, owned, prepared).v1.results[0].success).toEqual(true);
    }
  });

  it.each(['SINGLES', 'DOUBLES'])('C25 %s: enabling a fresh carry after an exit remains owed', (eventType) => {
    const profile = { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 7, eventType };
    const correction: HeldCarryCorrection = {
      name: 'enable fresh carry',
      previous: WALKOVER,
      entered: DEFAULTED,
      initialCarry: false,
    };
    const { prepared, scenario } = prepareHeldCarryCorrection(profile, correction, false);
    expect(compareUndirectedWinner(scenario, false, prepared).v1.results[0].success).toEqual(true);
  });

  it.each(['SINGLES', 'DOUBLES'])('C25 %s: disabling propagation keeps the carried record', (eventType) => {
    const profile = { drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 7, eventType };
    const correction: HeldCarryCorrection = {
      name: 'keep carry',
      previous: DEFAULTED,
      entered: COMPLETED,
      carry: false,
    };
    const { prepared, scenario } = prepareHeldCarryCorrection(profile, correction, true);
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });
});
