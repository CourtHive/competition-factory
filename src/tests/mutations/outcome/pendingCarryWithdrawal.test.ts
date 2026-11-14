import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { CARRIED, cleared, exited, play, R1 } from '@Tests/testHarness/outcome/directionFixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  COMPASS,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * C27: A PENDING CARRY WITHDRAWN WITH THE EXIT THAT MADE IT. `Main|1|1` (`East|1|1`) is a single exit entered with
 * `propagateExitStatus`: its loser carries the exit across the link, and the seat opposite them in the loser structure
 * is still empty, so the exit stands there awarded to nobody. The exit is then cleared. v1's
 * `removeDirectedParticipants` withdraws the exit it produced first (`withdrawProducedExits` → `applyWithdrawnExits`:
 * the loser matchUp back to be played, its provenance gone), takes the winner's position out of `Main|2|1`
 * (`removeDirectedWinner`), and empties the carrier's seat (`removeDirectedLoser`).
 */

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

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const EAST = new Set([COMPASS, OLYMPIC]);

const withdrawal = (drawType: string, drawSize: number, exit: string, winningSide: 1 | 2): [string, Scenario] => {
  const structureName = EAST.has(drawType) ? 'East' : 'Main';
  const target = R1(1, structureName);
  return [
    `${drawType} ${drawSize}: ${structureName}|1|1 a carried ${exit} won by side ${winningSide}, cleared before the opponent arrives`,
    {
      drawProfile: { drawSize, drawType },
      setup: [{ target, outcome: exited(exit, winningSide), params: CARRIED }],
      steps: [{ target, outcome: cleared, params: CARRIED }],
    },
  ];
};

const OWNED: [string, Scenario][] = [
  withdrawal(FIRST_ROUND_LOSER_CONSOLATION, 8, WALKOVER, 1),
  withdrawal(FIRST_ROUND_LOSER_CONSOLATION, 8, DEFAULTED, 2),
  withdrawal(FIRST_MATCH_LOSER_CONSOLATION, 8, WALKOVER, 2),
  withdrawal(FEED_IN_CHAMPIONSHIP, 16, WALKOVER, 1),
  withdrawal(FEED_IN_CHAMPIONSHIP, 16, DEFAULTED, 1),
  withdrawal(DOUBLE_ELIMINATION, 8, WALKOVER, 1),
];

/**
 * Where the loser structure links its own loser on (COMPASS's West, OLYMPIC's), the carrier loses the carried exit there
 * too and is carried on again: the exit's withdrawal reaches past the loser matchUp, which the certificate refuses
 */
const REFUSED: [string, Scenario][] = [withdrawal(COMPASS, 16, WALKOVER, 1), withdrawal(OLYMPIC, 16, DEFAULTED, 2)];

const tally = () => ({
  applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
  cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
});

describe('C27 a cleared single exit withdraws the carry it left pending on its loser matchUp', () => {
  it.each(OWNED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it.each(REFUSED)('%s: refused, v1 writes it', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied, cascade: before.cascade + 1 });
  });
});
