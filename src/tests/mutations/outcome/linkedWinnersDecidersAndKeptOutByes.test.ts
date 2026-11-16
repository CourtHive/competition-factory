import { CARRIED, compareUndirectedWinner, exited, retired, won } from '@Tests/testHarness/outcome/directionFixtures';
import { describe, it, vi } from 'vitest';

// constants and types
import type { Scenario, Step, Target } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

// counts v1's matchUp writes, so `compareUndirectedWinner` can assert v2 left none (`v2.v1Writes === 0`)
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

/**
 * BATCH 1: three first entries v1 made alone, each with the record, results and notices it leaves.
 *
 * A1, A WINNER CROSSING A WINNER LINK. DOUBLE_ELIMINATION's Backdraw champion goes to the Main final, in a structure
 * they already hold a position in: v1's `directWinnerViaLink` joins that position to the final (`linkedWinnerPosition`).
 *
 * A2, A FINAL FEEDING A DECIDER. The Main final sends its winner and its loser to the Decider: the winner is assigned
 * the seat the link gives them, the loser the other, and the Decider is a DEAD_RUBBER unless the final's loser has
 * lost only that once (`deciderSeats`, `reconcileDecider`). A TEAM final decided by its own call writes no line-up
 * there; one decided by a line is in the TEAM matrix (`teamMatrix.line.doubleElimination`, `deciderLineUpOps`).
 *
 * B, A KEPT-OUT LOSER'S BYE BESIDE SOMEBODY. A FIRST_MATCH_LOSER_CONSOLATION loser who has won before is kept out of
 * the feed, and a BYE takes their seat; whoever already stands opposite goes on through it (`keptOutByeChain`).
 */

const at = (structureName: string, roundNumber: number, roundPosition: number): Target => ({
  structureName,
  roundNumber,
  roundPosition,
});
const round = (structureName: string, roundNumber: number, count: number, side: 1 | 2 = 1): Step[] =>
  Array.from({ length: count }, (_, index) => ({
    target: at(structureName, roundNumber, index + 1),
    outcome: won(side),
  }));

// [drawSize, the rounds before the Backdraw final in playing order, the Backdraw final's round, the Main final's]
const DOUBLE_ELIMINATIONS: [number, [string, number, number][], number, number][] = [
  [
    8,
    [
      ['Main', 1, 4],
      ['Backdraw', 1, 2],
      ['Main', 2, 2],
      ['Backdraw', 2, 2],
      ['Backdraw', 3, 1],
      ['Main', 3, 1],
    ],
    4,
    4,
  ],
  [
    16,
    [
      ['Main', 1, 8],
      ['Backdraw', 1, 4],
      ['Main', 2, 4],
      ['Backdraw', 2, 4],
      ['Backdraw', 3, 2],
      ['Main', 3, 2],
      ['Backdraw', 4, 2],
      ['Backdraw', 5, 1],
      ['Main', 4, 1],
    ],
    6,
    5,
  ],
];

const OUTCOMES: [string, (side: 1 | 2) => Record<string, unknown>][] = [
  ['won', won],
  ['RETIRED', retired],
  [WALKOVER, (side) => exited(WALKOVER, side)],
  [DEFAULTED, (side) => exited(DEFAULTED, side)],
];

const SIDES = [1, 2] as const;

const backdrawFinals = (eventType?: string) =>
  DOUBLE_ELIMINATIONS.flatMap(([drawSize, rounds, backdrawFinal]) =>
    SIDES.flatMap((setupSide) =>
      OUTCOMES.flatMap(([label, outcome]) =>
        SIDES.map((side): [string, Scenario] => [
          `${eventType ?? 'SINGLES'} ${drawSize}, earlier rounds won by side ${setupSide}: Backdraw final ${label} side ${side}`,
          {
            drawProfile: {
              drawType: DOUBLE_ELIMINATION,
              drawSize,
              ...(eventType ? { eventType, tieFormatName: 'USTA_COLLEGE' } : {}),
            },
            setup: rounds.flatMap(([structureName, roundNumber, count]) =>
              round(structureName, roundNumber, count, setupSide),
            ),
            steps: [{ target: at('Backdraw', backdrawFinal, 1), outcome: outcome(side) }],
          },
        ]),
      ),
    ),
  );

const mainFinals = (eventType?: string) =>
  DOUBLE_ELIMINATIONS.flatMap(([drawSize, rounds, backdrawFinal, mainFinal]) =>
    OUTCOMES.flatMap(([label, outcome]) =>
      SIDES.map((side): [string, Scenario] => [
        `${eventType ?? 'SINGLES'} ${drawSize}: Main final ${label} side ${side}`,
        {
          drawProfile: {
            drawType: DOUBLE_ELIMINATION,
            drawSize,
            ...(eventType ? { eventType, tieFormatName: 'USTA_COLLEGE' } : {}),
          },
          setup: [
            ...rounds.flatMap(([structureName, roundNumber, count]) => round(structureName, roundNumber, count)),
            ...round('Backdraw', backdrawFinal, 1),
          ],
          steps: [{ target: at('Main', mainFinal, 1), outcome: outcome(side) }],
        },
      ]),
    ),
  );

// a second-round Main loser has won before and is kept out; the Consolation's first round is played or not before it
const keptOut = (consolationPlayed: boolean) =>
  ([8, 16] as const).flatMap((drawSize) =>
    OUTCOMES.flatMap(([label, outcome]) =>
      SIDES.map((side): [string, Scenario] => [
        `${drawSize}, Consolation round 1 ${consolationPlayed ? 'played' : 'unplayed'}: Main 2/1 ${label} side ${side}`,
        {
          drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize },
          setup: [
            ...round('Main', 1, drawSize / 2),
            ...(consolationPlayed ? round('Consolation', 1, drawSize / 4) : []),
          ],
          steps: [{ target: at('Main', 2, 1), outcome: outcome(side) }],
        },
      ]),
    ),
  );

describe('BATCH 1 (A1) a winner crossing a winner link', () => {
  it.each(backdrawFinals())('%s: owned', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
  it.each(backdrawFinals('TEAM').filter(([label]) => label.includes(' 8,')))('%s: owned', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
});

describe('BATCH 1 (A2) a final feeding its Decider', () => {
  it.each(mainFinals())('%s: owned', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
  it.each(mainFinals('TEAM').filter(([label]) => label.includes(' 8:')))('%s: owned', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
});

describe('BATCH 1 (B) a kept-out loser whose BYE meets somebody', () => {
  it.each(keptOut(true))('%s: owned', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
  it.each(keptOut(false))('%s: owned, the BYE alone in its matchUp', (_, scenario) => {
    compareUndirectedWinner(scenario, true);
  });
});

// an exit that propagates puts every settle pass in reach (`predictSettleWork`): these stay v1's
const carried = (scenarios: [string, Scenario][]) =>
  scenarios
    .filter(([label]) => label.includes(WALKOVER) || label.includes(DEFAULTED))
    .map(([label, scenario]): [string, Scenario] => [
      `${label}, propagateExitStatus`,
      { ...scenario, steps: scenario.steps.map((step) => ({ ...step, params: CARRIED })) },
    ]);

describe('BATCH 1 controls: a propagating exit on a final or beside a kept-out BYE', () => {
  it.each([...carried(mainFinals()), ...carried(keptOut(true))])('%s: v1s', (_, scenario) => {
    compareUndirectedWinner(scenario, false);
  });
});
