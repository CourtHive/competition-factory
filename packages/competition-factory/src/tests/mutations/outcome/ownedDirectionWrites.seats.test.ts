import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  compareUndirectedWinner,
  C26_SEAT_CASES,
  prepareC26Seat,
  c26SeatScenario,
  C26_LANDING_CASES,
  c26Stored,
  prepareC26Landing,
  C26_UNSTAMPED_FINALS,
  C26_REPLAY_CASES,
  prepareC26EarlierBye,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';

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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.seats.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C26 a loser BYE passes a standing carry onward or ends at its final', () => {
  it.each(C26_SEAT_CASES)('%s', (_label, recipe) => {
    const prepared = prepareC26Seat(recipe);
    // Shared seat service supersedes the OLYMPIC fallback. DE4 still needs later settle work:
    // compare ownership, records and notices without requiring its first refusal to remain the exit guard.
    expect(
      compareUndirectedWinner(c26SeatScenario(recipe, prepared), recipe.owned, prepared.prepared).v1.results[0].success,
    ).toEqual(true);
  });
});

describe('C26 TEAM landing keeps lineups and follows the actual carry origin', () => {
  it.each(C26_LANDING_CASES)('%s', (_label, recipe, stage) => {
    const prepared = prepareC26Landing(recipe, stage);
    expect(
      compareUndirectedWinner(c26SeatScenario(recipe, prepared), true, prepared.prepared).v1.results[0].success,
    ).toEqual(true);
  });
});

describe('C26 an unstamped terminal home has no scored-time reconciliation', () => {
  it.each(C26_UNSTAMPED_FINALS)('%s', (_label, recipe) => {
    const prepared = prepareC26Seat(recipe);
    expect(prepared.home?.winnerMatchUpId).toBeUndefined();
    const home = c26Stored(prepared.prepared, prepared.home?.matchUpId);
    expect(home?.schedule?.scoredTime).toBeDefined();
    delete home!.schedule!.scoredTime;
    expect(
      compareUndirectedWinner(c26SeatScenario(recipe, prepared), true, prepared.prepared).v1.results[0].success,
    ).toEqual(true);
  });
});

describe('C26 a carry replay revisits the first stored BYE and its onward path', () => {
  it.each(C26_REPLAY_CASES)('%s', (_label, eventType, carrierStatus, status, reverse) => {
    const { drawProfile, prepared } = prepareC26EarlierBye(eventType, carrierStatus, reverse);
    const scenario: Scenario = {
      drawProfile,
      steps: [
        {
          target: { structureName: 'Main', roundNumber: 2, roundPosition: eventType === 'SINGLES' ? 1 : 2 },
          outcome: { matchUpStatus: status },
          params: { propagateExitStatus: true },
        },
      ],
    };
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });
});
