import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { CARRIED, cleared, exited, play, R1, won } from '@Tests/testHarness/outcome/directionFixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
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

/** `then`: the step after the carry, the exit cleared or (S6, `completed-to-double-exit`) turned into a double exit */
const withdrawal = (
  drawType: string,
  drawSize: number,
  exit: string,
  winningSide: 1 | 2,
  then?: string,
): [string, Scenario] => {
  const structureName = EAST.has(drawType) ? 'East' : 'Main';
  const target = R1(1, structureName);
  const outcome = then ? { matchUpStatus: then } : cleared;
  const step = then ? 'made a ' + then : 'cleared';
  return [
    `${drawType} ${drawSize}: ${structureName}|1|1 a carried ${exit} won by side ${winningSide}, ${step} before the opponent arrives`,
    {
      drawProfile: { drawSize, drawType },
      setup: [{ target, outcome: exited(exit, winningSide), params: CARRIED }],
      steps: [{ target, outcome, params: CARRIED }],
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
  withdrawal(FIRST_ROUND_LOSER_CONSOLATION, 8, WALKOVER, 1, DOUBLE_WALKOVER),
  withdrawal(FIRST_MATCH_LOSER_CONSOLATION, 8, DEFAULTED, 2, DOUBLE_DEFAULT),
  withdrawal(FEED_IN_CHAMPIONSHIP, 16, WALKOVER, 1, DOUBLE_DEFAULT),
  withdrawal(DOUBLE_ELIMINATION, 8, DEFAULTED, 1, DOUBLE_WALKOVER),
];

/**
 * Where the loser structure links its own loser on (COMPASS's West, OLYMPIC's), the carrier loses the carried exit there
 * too and is carried on again: the exit's withdrawal reaches past the loser matchUp, which the certificate refuses
 */
const REFUSED: [string, Scenario][] = [withdrawal(COMPASS, 16, WALKOVER, 1), withdrawal(OLYMPIC, 16, DEFAULTED, 2)];

/** the winner changed (`winner` route): the old carry withdrawn, the new loser placed plainly, or carrying the new exit */
const changed = (drawType: string, drawSize: number, exit: string, next?: string): [string, Scenario] => {
  const target = R1(1, 'Main');
  return [
    `${drawType} ${drawSize}: Main|1|1 a carried ${exit} won by side 1, then ${next ?? 'played'} won by side 2`,
    {
      drawProfile: { drawSize, drawType },
      setup: [{ target, outcome: exited(exit, 1), params: CARRIED }],
      steps: [{ target, outcome: next ? exited(next, 2) : won(2), params: CARRIED }],
    },
  ];
};

const CHANGED: [string, Scenario][] = [
  changed(FIRST_ROUND_LOSER_CONSOLATION, 8, WALKOVER),
  changed(FEED_IN_CHAMPIONSHIP, 16, DEFAULTED),
  changed(DOUBLE_ELIMINATION, 8, WALKOVER),
];

/**
 * Not this slice, refused before the carry is read: a FIRST_MATCHUP link (FMLC, whose removal may take a BYE back), and
 * a new exit, whose loser carries it on (`changedWinnerReason`'s `loser.exit`)
 */
const CHANGED_OUTSIDE: [string, Scenario][] = [
  changed(FIRST_MATCH_LOSER_CONSOLATION, 8, WALKOVER),
  changed(FIRST_ROUND_LOSER_CONSOLATION, 8, WALKOVER, WALKOVER),
  changed(FEED_IN_CHAMPIONSHIP, 16, WALKOVER, DEFAULTED),
];

/**
 * Owned whole or not at all (`planCall`): the carry admitted, but the plan after it not owned, the call is decided as it
 * is without C27 and keeps the refusal the carry check gives it. FMLC's re-score: the new loser's first-match
 * reservation in the consolation is settle work (`reconcileConsolationReservations`) the plan leaves.
 */
const ADMITTED_NOT_OWNED: [string, Scenario][] = [
  [
    'FIRST_MATCH_LOSER_CONSOLATION 8: Main|1|3 a carried WALKOVER won by side 2, then played won by side 1',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(3, 'Main'), outcome: exited(WALKOVER, 2), params: CARRIED }],
      steps: [{ target: R1(3, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
];

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

  it.each(CHANGED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it.each(CHANGED_OUTSIDE)('%s: outside, v1 writes it', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally().applied).toEqual(before.applied);
  });

  it.each(ADMITTED_NOT_OWNED)('%s: admitted, not owned, the refusal kept', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied, cascade: before.cascade + 1 });
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
