import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import {
  won,
  CARRIED,
  R1,
  NOTICE_RELAY_CARRIES,
  CONVERGED_RELAY_CAPTURES,
  OCCUPIED_FINAL_RELAY_CAPTURES,
  OCCUPIED_FINAL_CLEARS,
  TERMINAL_RELAY_CAPTURES,
  TERMINAL_TRUE_CLEARS,
  TERMINAL_TRUE_WINNERS,
  FIRST_MATCHUP_OWNED,
  STANDING_BYE_CAPTURES,
  INDIRECT_COMPOUND_CLEARS,
  SCENARIOS,
  play,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.subscribed.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('M1 notice contracts also compare with in-context subscribers under differential', () => {
  const noops = SCENARIOS.filter(([label]) => label.includes('asked for again'));
  it.each([...noops, ...NOTICE_RELAY_CARRIES])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results.every((result: any) => result.success)).toEqual(true);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 converged produced relays compare subscribed differential notices', () => {
  it.each(CONVERGED_RELAY_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 CURTIS standing BYE compares subscribed differential notices', () => {
  it.each(STANDING_BYE_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 FMLC FIRST_MATCHUP arrivals compare subscribed differential notices', () => {
  it.each(FIRST_MATCHUP_OWNED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 indirect compound clears compare subscribed differential notices', () => {
  it.each(INDIRECT_COMPOUND_CLEARS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 the original indirect compound winner remains v1s', () => {
  it('Main 1/2 double default corrected to walkover retains two legacy writers, whole', () => {
    const captured = INDIRECT_COMPOUND_CLEARS.find(
      ([label]) => label === 'indirect compound clear: DOUBLE_DEFAULT/DOUBLE_WALKOVER/DOUBLE_WALKOVER',
    );
    expect(captured).toBeDefined();
    const scenario: Scenario = {
      ...captured![1],
      steps: [{ ...captured![1].steps[0], outcome: { matchUpStatus: WALKOVER, winningSide: 1 } }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(2);
    expect(v1.notices).toHaveLength(18);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(2);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 terminal direct relays compare subscribed differential notices', () => {
  it.each([...TERMINAL_RELAY_CAPTURES, ...TERMINAL_TRUE_CLEARS])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 terminal propagation winners remain v1s', () => {
  it.each(TERMINAL_TRUE_WINNERS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 occupied-final results compare subscribed differential notices', () => {
  it('the public setup has a real carrier beside the relay producer in a final', () => {
    const [, scenario] = OCCUPIED_FINAL_CLEARS[0];
    play(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
    const at = (structureName: string, roundNumber: number, roundPosition: number) =>
      matchUps.find(
        (matchUp: any) =>
          matchUp.structureName === structureName &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
    const producer = at('Consolation', 1, 2);
    const relay = at('Consolation', 2, 2);
    const onward = at('Consolation', 3, 1);
    const carrierSource = at('Main', 1, 2);
    expect(producer.winnerMatchUpId).toEqual(relay.matchUpId);
    expect(relay.matchUpStatus).toEqual(BYE);
    expect(relay.drawPositions).toEqual([2]);
    expect(onward.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(onward.winnerMatchUpId).toBeUndefined();
    expect(onward.sides.filter((side: any) => side.participantId).map((side: any) => side.drawPosition)).toEqual([4]);
    expect(
      Object.values(onward.sideExitProvenance)
        .map((entry: any) => entry.sourceMatchUpId)
        .sort(),
    ).toEqual([producer.matchUpId, carrierSource.matchUpId].sort());
  });
  it.each(OCCUPIED_FINAL_RELAY_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 occupied-final winner scope controls remain v1s', () => {
  const controls: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['reported score', won(1), CARRIED],
    ['requested format', { winningSide: 1 }, { ...CARRIED, matchUpFormat: 'SET1-S:6/TB7' }],
    ['carried schedule', { winningSide: 1 }, { ...CARRIED, schedule: { scheduledDate: '2026-10-25' } }],
    ['carried notes', { winningSide: 1 }, { ...CARRIED, notes: 'occupied winner scope control' }],
  ];
  it.each(controls)('%s', (_label, outcome, params) => {
    const captured = OCCUPIED_FINAL_RELAY_CAPTURES.find(([label]) =>
      label.endsWith('WALKOVER/DOUBLE_WALKOVER/DOUBLE_WALKOVER/winner1'),
    );
    expect(captured).toBeDefined();
    const scenario: Scenario = {
      ...captured![1],
      steps: [{ ...captured![1].steps[0], outcome, params }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(v1.v1Writes);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 the nonterminal outer occupied correction remains v1s', () => {
  it('the original five-setup Main 1/2 double default corrected to walkover remains fallback, whole', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 20650915,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        {
          target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
          params: CARRIED,
        },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
      ],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: WALKOVER, winningSide: 1 }, params: CARRIED }],
    };
    const random = Math.random;
    try {
      Math.random = createSeededRandom(2519021469);
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v1.v1Writes).toEqual(2);
      expect(v1.notices).toHaveLength(12);
      for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
        Math.random = createSeededRandom(2519021469);
        const compared = play(mode, scenario);
        expect(compared.v1Writes).toEqual(2);
        expect(compared.results).toEqual(v1.results);
        expect(compared.record).toEqual(v1.record);
        expect(compared.notices).toEqual(v1.notices);
      }
    } finally {
      Math.random = random;
    }
  });
});
