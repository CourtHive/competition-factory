import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { CARRIED, exited, MAIN, play, won } from '@Tests/testHarness/outcome/directionFixtures';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';

// constants and types
import { DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * C20: A STANDING AWARD THE ARRIVING WINNER TAKES, the winner's twin of C18. `Main|1|1`'s winner waits alone in
 * `Main|2|1` and exits there before the opponent arrives (CA, 2026-10-04): the empty side is awarded the WALKOVER or
 * DEFAULTED, its provenance on the exiting side. `Main|1|2`'s winner then arrives on that empty side and takes the award:
 * v1's `assignMatchUpDrawPosition` adds the position, writes the award back with its codes re-derived, announces it as
 * the assignment, and sends the position on into `Main|3|1` (`advanceIntoWinnerMatchUp`).
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

const arrival = (drawType: string, drawSize: number, exit: string): [string, Scenario] => [
  `${drawType} ${drawSize}: Main|2|1 a ${exit} before the opponent arrives, Main|1|2's winner takes it`,
  {
    drawProfile: { drawSize, drawType },
    setup: [
      { target: MAIN(1, 1), outcome: won(1) },
      { target: MAIN(2, 1), outcome: exited(exit, 2) },
    ],
    steps: [{ target: MAIN(1, 2), outcome: won(1) }],
  },
];

/**
 * A carried award: `Main|2|1`'s WALKOVER carries its loser into `Consolation|2|4`'s fed seat (`propagateExitStatus`),
 * awarded to the empty seat with the carrier's provenance; `Consolation|1|4`'s winner arrives there and takes it
 */
const CARRIED_INTO_CONSOLATION: [string, Scenario] = [
  'FEED_IN_CHAMPIONSHIP 16: a WALKOVER carried into Consolation|2|4, Consolation|1|4s winner takes it',
  {
    drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
    setup: [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((roundPosition) => ({
        target: MAIN(1, roundPosition),
        outcome: won(1),
        params: CARRIED,
      })),
      { target: MAIN(2, 1), outcome: exited(WALKOVER, 2), params: CARRIED },
    ],
    steps: [
      {
        target: { structureName: 'Consolation', roundNumber: 1, roundPosition: 4 },
        outcome: won(1),
        params: CARRIED,
      },
    ],
  },
];

/**
 * The award the arrival takes is all v1 writes there. Entered directly, the award's loser is a real participant, already
 * directed, so a next matchUp linking its loser on is written nothing over that link (FEED_IN_CHAMPIONSHIP,
 * DOUBLE_ELIMINATION). A carried award linking its loser on (its loser is nobody, and v1 gives that seat a BYE,
 * `propagateUnfillableLoserBye`) is refused by the certificate; no input built here reaches it.
 */
const OWNED: [string, Scenario][] = [
  arrival(SINGLE_ELIMINATION, 8, WALKOVER),
  arrival(SINGLE_ELIMINATION, 8, DEFAULTED),
  arrival(SINGLE_ELIMINATION, 16, WALKOVER),
  arrival(FEED_IN_CHAMPIONSHIP, 16, WALKOVER),
  arrival(DOUBLE_ELIMINATION, 8, DEFAULTED),
  CARRIED_INTO_CONSOLATION,
];

const tally = () => ({
  applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
  cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
});

describe('C20 the winner arriving where a carried exit stands awarded to their seat takes it and goes on', () => {
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
});
