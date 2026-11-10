import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { replayFailure } from '@Tests/testHarness/exitPropagation/sweep';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';
import {
  won,
  cleared,
  NOTED,
  walkover,
  exited,
  CARRIED,
  SWAP_CARRIED,
  POLICY_OFF,
  R1,
  MAIN,
  MAIN_R1_8,
  FINAL_8,
  TO_FINAL_8,
  PAIRED,
  PLAYED_ON,
  AWARDEE_PLAYED_ON,
  FMLC_RESERVATION,
  play,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Step, Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  OLYMPIC,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

// Fixtures
import { POLICY_SCORING_DEFAULT } from '@Fixtures/policies/POLICY_SCORING_DEFAULT';

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

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.boundaries.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('under v2, a FIRST_MATCHUP reservation is v2s', () => {
  it('FIRST_MATCH_LOSER_CONSOLATION: the second winner into Main round 2 reserves its loser seat with a BYE', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, FMLC_RESERVATION);
    // CONTROL: v1 reserved the seat, so the scenario exercises the reservation
    const reserved = JSON.parse(v1.record)
      .events[0].drawDefinitions[0].structures.find((structure: any) => structure.structureName === 'Consolation')
      .positionAssignments.filter((assignment: any) => assignment.bye && assignment.byeFromPropagation);
    expect(reserved.length).toEqual(1);

    const v2 = play(OUTCOME_PIPELINE_V2, FMLC_RESERVATION);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('under v2, an exit v2 does not plan is v1s, whole', () => {
  it('F9: a carry that would reach v1s bound is v1s, which refuses there; v2 never plans the bound', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    };
    const saved = SETTLE_PASS_LIMITS.exitLevels;
    SETTLE_PASS_LIMITS.exitLevels = 1;
    try {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      // CONTROL: East's carry goes West then South, two levels, so a bound of one stops it
      expect(v1.results[0].error?.code).toEqual(SETTLE_BOUND_REACHED.code);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
    } finally {
      SETTLE_PASS_LIMITS.exitLevels = saved;
    }
  });

  it('F9 (S6 tail): a BYE passage costs v1 one iteration per BYE passed, so a carry within the levels can still reach the bound', () => {
    // COMPASS 16/13: East 1/5's carry lands in West (one iteration), then passes two BYE-held matchUps in South (two more)
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: COMPASS },
      steps: [{ target: R1(5, 'East'), outcome: walkover(1), params: CARRIED }],
    };
    const saved = SETTLE_PASS_LIMITS.exitLevels;
    SETTLE_PASS_LIMITS.exitLevels = 2;
    try {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      // CONTROL: v1 refuses at the bound
      expect(v1.results[0].error?.code).toEqual(SETTLE_BOUND_REACHED.code);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
    } finally {
      SETTLE_PASS_LIMITS.exitLevels = saved;
    }
  });

  it('S6 tail: a double walkover under policy off cleared while another double exit holds a BYE on its consolation path is v1s', () => {
    // FEED_IN_CHAMPIONSHIP 8: Main 1/3's double walkover leaves Main 2/2 nobody for a loser, so Consolation 2/1 (where
    // Main 1/1's carry would send its awardee on) holds a propagated BYE that is not this unwind's: the branch stops there
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6 tail: an OLYMPIC census replay under policy off (20779675) compares whole, a cleared double default whose branch meets a result', () => {
    // census (`aCarrierComesHomeWithOnlyTheirOwnCarry`): East 1/9's double default carries into West, where its awardee
    // plays on (West 1/6) before the double default is cleared; the branch's walk meets that result and stops (v1's)
    const at = (key: string, outcome: any) => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
    };
    const config = {
      drawType: OLYMPIC,
      propagateExitStatus: true,
      participantsCount: 29,
      drawSize: 32,
      seed: 20779675,
    };
    const schedule = [
      at('East|1|10', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|11', { winningSide: 1 }),
      at('East|1|9', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|12', { winningSide: 1 }),
      at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('West|1|6', { winningSide: 2 }),
      at('East|1|9', cleared),
    ];
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(replayFailure(config, schedule, 'olympic-policy-off-differential-2', POLICY_OFF)).toBeNull();
  });

  it('S6 tail: an OLYMPIC census replay under policy off (20609643) compares whole, the branch stopping at a standing BYE', () => {
    // census S8 policy-off, OLYMPIC 32/30 (`aPendingExitAwaitingAnArrivalCanDeliver`): West's carries reach South,
    // where a BYE stands behind the branch's own loser link; the branch walks that link and stops there (v1's). Dropping
    // the stop plans a branch that writes less than v1
    const at = (key: string, outcome: any) => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
    };
    const config = {
      drawType: OLYMPIC,
      propagateExitStatus: true,
      participantsCount: 30,
      drawSize: 32,
      seed: 20609643,
    };
    const schedule = [
      at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|2', { winningSide: 2 }),
      at('East|1|9', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ];
    // under `differential`: the shadow of such a branch diverges from v1's record, which the replay reports as a finding
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(replayFailure(config, schedule, 'olympic-policy-off-differential', POLICY_OFF)).toBeNull();
  });

  it('S6 tail: a cleared double walkover under policy off whose carry sent BYEs on through a BYE chain (COMPASS) is v1s', () => {
    // the award of the carried walkover had nobody for a loser, so its seat took a BYE, and that BYE went on across the
    // consolation's own loser link: the chain is the main path's unwind to withdraw, which v2 leaves to v1
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6: a cleared walkover that carried its exit across the loser link is v1s (its provenance there)', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  // S6 tail: a carry the awardee has played on from stands as it was (v1's `withdrawable`), whatever the relabel says
  it('S6 tail: a carried walkover relabelled a default once the awardee has played on is v1s, the carry kept', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...PLAYED_ON(walkover(1), CARRIED), ...AWARDEE_PLAYED_ON],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    // and the direction v2 plans for it says nothing v1 does not write: the carry is not read as the exit it would be
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results[0].success).toEqual(true);
  });

  // ...and a relabel to a played result once the awardee has played on is a change of kind over a recorded result: refused
  // (§ 2 row 22), by v2 as by v1
  it('S6 tail: a carried walkover relabelled a played result once the awardee has played on is refused, by both', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...PLAYED_ON(walkover(1), CARRIED), ...AWARDEE_PLAYED_ON],
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].error).toBeDefined();
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  // S6 tail: a swap away from a carried exit withdraws the carry from the seat the new loser takes: v1's
  it('S6 tail: a carried walkover swapped to a played result for the other side is v1s, whole', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(2), params: SWAP_CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    if (v1.results[0].success) expect(v2.v1Writes).toBeGreaterThan(0);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
  });

  // S6 tail: a swap whose new loser arrives at a pending exit standing on the seat the old loser held wins it (RULE 3), as
  // v1's `swapWinnerLoser` sends them: no carry is planned there (`planSwap`), and the call is v1's
  // (`swapWinnerLoserResort.test.ts`: census 9100555, DOUBLE_ELIMINATION 8/6, flag ON)
  it('S6 tail: a swap onto a seat holding a pending walkover is v1s, and the direction plans no carry', () => {
    const steps: [string, Record<string, unknown>][] = [
      ['Main|1|2', { winningSide: 2 }],
      ['Main|1|3', { winningSide: 2 }],
      ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Backdraw|3|1', { winningSide: 2 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ];
    const run = (mode: OutcomePipelineMode) => {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      setClock('2026-10-25T00:00:00.000Z');
      setSubscriptions({ subscriptions: {} });
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 6, drawId: 'd' }],
        nonRandom: 9100555,
        setState: true,
      });
      const find = (key: string): any =>
        tournamentEngine
          .allDrawMatchUps({ drawId: 'd', inContext: true })
          .matchUps.find((m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}` === key);
      const submit = (key: string, outcome: Record<string, unknown>) =>
        tournamentEngine.setMatchUpStatus({ ...SWAP_CARRIED, matchUpId: find(key).matchUpId, outcome, drawId: 'd' });
      // every step under the mode: the sixth flips Main|2|1 from a default to a walkover for the other side, onto a
      // Backdraw seat holding that default's carry beside a pending exit
      setOutcomePipeline(mode);
      v1Writes.count = 0;
      for (const [key, outcome] of steps) expect(submit(key, outcome).success).toEqual(true);
      const flipped = find('Main|1|2');
      const result: any = submit('Main|1|2', { winningSide: 3 - flipped.winningSide });
      return {
        result,
        v1Writes: v1Writes.count,
        record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
      };
    };
    const v1 = run(OUTCOME_PIPELINE_V1);
    const v2 = run(OUTCOME_PIPELINE_V2);
    expect(v1.result.success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    const compared = run(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(compared.result.success).toEqual(true);
  });

  // the consolation matchUp holds both feeders' carries: withdrawing one is not the plain withdrawal
  it('S6: a carried walkover relabelled a played result beside a second carry on its loser matchUp is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6: a played result relabelled a walkover for the other side, its new loser carrying it, is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it.each<[string, Scenario]>([
    [
      'S6: a round robin result turned into a double walkover is v1s (the group is tallied)',
      {
        drawProfile: { drawSize: 4, drawType: ROUND_ROBIN },
        setup: [{ target: { roundNumber: 1, nth: 0 }, outcome: won(1) }],
        steps: [{ target: { roundNumber: 1, nth: 0 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
    [
      'S6: a walkover its loser carried across their link, turned into a double walkover, is v1s (FEED_IN_CHAMPIONSHIP)',
      {
        drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
        steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
  ])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S7: FMLC, a double walkover awarded to the paired winner then given a winner: v1s (the consolation seat)', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('a default under a scoring policy naming incompleteAssignmentsOnDefault: v1 may write processCodes', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      policyDefinitions: POLICY_SCORING_DEFAULT,
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

  it('S6: a walkover relabelled a default under that policy is v1s too', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      policyDefinitions: POLICY_SCORING_DEFAULT,
      setup: [{ target: R1(1), outcome: walkover(1) }],
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});

// S6 tail, family 4: the dissolved convergence beyond a clear is v2's; given a winner (the winner then awarded the
// re-derived pending exit and sent on) and under `doubleExitPropagateBye: false` (the consolation convergence of the two
// carries re-derived too) it stays v1's, whole. A released award given a winner is v2's since S7 (SCENARIOS)
describe('under v2, a dissolved convergence beyond the clear is v2s; given a winner or under policy off it is v1s', () => {
  const V1S: [string, Scenario][] = [
    [
      'SINGLE_ELIMINATION: a double walkover given a winner, its produced exit converged',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
        steps: [{ target: R1(1), outcome: won(1) }],
      },
    ],
    [
      'FIRST_MATCH_LOSER_CONSOLATION: a double walkover cleared, converged: the freed seat advances on through a BYE',
      {
        drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
    [
      'SINGLE_ELIMINATION 16: four double walkovers, the final awarded to the other half, the first cleared',
      {
        drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
        setup: [
          ...PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
          { target: R1(3), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: R1(4), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: R1(5), outcome: won(1) },
          { target: R1(6), outcome: won(1) },
          { target: R1(7), outcome: won(1) },
          { target: R1(8), outcome: won(1) },
          { target: { roundNumber: 2, roundPosition: 3 }, outcome: won(1) },
          { target: { roundNumber: 2, roundPosition: 4 }, outcome: won(1) },
          { target: { roundNumber: 3, roundPosition: 2 }, outcome: won(1) },
        ],
        steps: [{ target: R1(1), outcome: cleared }],
      },
    ],
    [
      'FIRST_ROUND_LOSER_CONSOLATION 16: paired double walkovers, the seat beyond their double BYE still empty',
      {
        drawProfile: { drawSize: 16, drawType: FIRST_ROUND_LOSER_CONSOLATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a consolation double walkover cleared once the fed loser was awarded its produced exit',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [
          ...MAIN_R1_8,
          { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' }, outcome: won(1) },
        ],
        steps: [{ target: R1(1, 'Consolation'), outcome: cleared }],
      },
    ],
    [
      'DOUBLE_ELIMINATION: the Main final entered as a double walkover: the Decider is its winner target',
      {
        drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
        setup: TO_FINAL_8('Main').slice(0, 6),
        steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
    [
      'DOUBLE_ELIMINATION: the Main final a double walkover cleared: the Decider, fed by both its links, is visited',
      {
        drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
        setup: TO_FINAL_8('Main'),
        steps: [{ target: FINAL_8('Main'), outcome: cleared }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a double walkover cleared, converged, under doubleExitPropagateBye false',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        policyDefinitions: POLICY_OFF,
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
  ];
  it.each(V1S)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

// S6 tail: a refusal v2 returns is v1's result, field for field: row 9's `activeDownstream` beside `error` (a double
// exit cleared or re-entered over an active downstream), and rows 13 / 14's context naming the stored matchUp (a double
// exit given a winner once its awardee has played on)
describe('under v2, a refused outcome returns exactly the result v1 returns', () => {
  const AWARDEE_WON_ON: Step[] = [
    { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    { target: R1(2), outcome: won(1) },
    { target: R1(3), outcome: won(1) },
    { target: R1(4), outcome: won(1) },
    { target: { roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
    { target: { roundNumber: 3, roundPosition: 1 }, outcome: won(1) },
  ];
  const REFUSED: [string, Scenario][] = [
    [
      'SINGLE_ELIMINATION: a double walkover cleared once its awardee has played on (row 9, activeDownstream)',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: AWARDEE_WON_ON,
        steps: [{ target: R1(1), outcome: cleared }],
      },
    ],
    [
      'SINGLE_ELIMINATION: a double walkover given a winner once its awardee has played on (row 13, the matchUp named)',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: AWARDEE_WON_ON,
        steps: [{ target: R1(1), outcome: won(1) }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a double walkover cleared once its awardee has played on, beside a consolation (row 9)',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        setup: AWARDEE_WON_ON.map(({ target, outcome }) => ({ target: { ...target, structureName: 'Main' }, outcome })),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
  ];
  it.each(REFUSED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    // CONTROL: v1 refused
    expect(v1.results.every((result: any) => result.error)).toEqual(true);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('under v2, notes on a double exit are v1s (S7: v1 forwards the calls params to the exits it writes)', () => {
  it('a double walkover with notes abstains `notes`, and v2 leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: NOTED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const deferred = () => getDifferentialTally()['shadow:abstain:notes']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});

describe('the convergence beyond a relayed copy that feeds on is v1s (ruling 2: the geometry wall held by a test)', () => {
  // Consolation 3/1 converges to a double walkover holding the carrier alone, but feeds Consolation 4/1, which v1 also
  // rewrites (and takes a participant back out of 5/1). Every relay program refuses it; only `occupiedFinalRelaySeatOps`'s
  // `next.winnerMatchUpId` clause tells it from the occupied final. A classifier on the copy's content alone would own it.
  it('FIC_TO_SF 16 of 15 (seed 1): Main 2/3 cleared after Main 2/4 and Consolation 1/2 double walkovers abstains `exit`, and v2 leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 1,
      setup: [
        { target: MAIN(1, 2), outcome: walkover(1), params: CARRIED },
        ...[3, 4, 5, 6, 7, 8].map((roundPosition) => ({
          target: MAIN(1, roundPosition),
          outcome: won(1),
          params: CARRIED,
        })),
        { target: MAIN(2, 4), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: MAIN(2, 3), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
      ],
      steps: [{ target: MAIN(2, 3), outcome: cleared, params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const deferred = () => getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});
