import { collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  generateSchedule,
  prepareDraw,
  randomConfig,
  replayFailure as replay,
} from '@Tests/testHarness/exitPropagation/sweep';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * When two exits MEET, which double exit the matchUp becomes is derived from what each side carried.
 *
 * `progressExitStatus` RULE 4 hardcoded `DOUBLE_WALKOVER` for every convergence, so a
 * default-on-default pair was relabelled a walkover — and since `producedExitStatus` maps
 * `DOUBLE_DEFAULT` to `DEFAULTED`, the relabelling propagated a `WALKOVER` downstream where a
 * `DEFAULTED` belonged.
 *
 * The rule: *"a DOUBLE_DEFAULT producing a side record DEF sounds right, the same as a
 * DOUBLE_WALKOVER producing a WO / WALKOVER sounds right; my assertion was a WALKOVER and a DEFAULT
 * would produce a WALKOVER, not a DEF."* So a uniform pair keeps its flavour and any MIXTURE
 * collapses to `DOUBLE_WALKOVER`, whose production is the unattributed walkover.
 *
 * The asymmetry is about attribution: a default is a referee's finding against a named player, and
 * in a mixed convergence one side merely failed to appear. `courthive-components`
 * `renderParticipant.ts:113`/`:48` render this matchUp-level status per PARTICIPANT, so the stronger
 * claim would put a `DEF` badge beside an innocent name.
 */

const COLLAPSE_CASES: { label: string; sides: (MatchUpStatusUnion | undefined)[]; expected: MatchUpStatusUnion }[] = [
  { label: 'both walkovers', sides: [WALKOVER, WALKOVER], expected: DOUBLE_WALKOVER },
  { label: 'both defaults', sides: [DEFAULTED, DEFAULTED], expected: DOUBLE_DEFAULT },
  { label: 'a default meeting a walkover', sides: [DEFAULTED, WALKOVER], expected: DOUBLE_WALKOVER },
  { label: 'a walkover meeting a default (order reversed)', sides: [WALKOVER, DEFAULTED], expected: DOUBLE_WALKOVER },
  { label: 'the double flavours, both default', sides: [DOUBLE_DEFAULT, DEFAULTED], expected: DOUBLE_DEFAULT },
  { label: 'a retirement is not default-flavoured', sides: [RETIRED, DEFAULTED], expected: DOUBLE_WALKOVER },
  { label: 'an unknown side does not force a default', sides: [DEFAULTED, undefined], expected: DOUBLE_DEFAULT },
  { label: 'nothing known at all', sides: [undefined, undefined], expected: DOUBLE_WALKOVER },
];

it.each(COLLAPSE_CASES)('$label collapses to $expected', ({ sides, expected }) => {
  expect(collapseDoubleExitStatus(sides)).toEqual(expected);
});

it('is order-invariant for every pair', () => {
  const statuses: (MatchUpStatusUnion | undefined)[] = [
    WALKOVER,
    DEFAULTED,
    RETIRED,
    DOUBLE_WALKOVER,
    DOUBLE_DEFAULT,
    undefined,
  ];
  for (const first of statuses) {
    for (const second of statuses) {
      expect(
        collapseDoubleExitStatus([first, second]),
        `[${first}, ${second}] must collapse the same way as its reverse`,
      ).toEqual(collapseDoubleExitStatus([second, first]));
    }
  }
});

it('persists no positional codes, and every reason it keeps is a string keyed by side', () => {
  // Driven through the sweep harness over the seeds that exercised the convergences most: 8.x writes no positional
  // `matchUpStatusCodes`, and a reason a side carries is stored keyed (`sideStatusCodes`), one string per side.
  const seeds = [9000003, 9000010, 9000012, 9000019, 9000056, 9000060, 9000062, 9000074];
  let exitsSeen = 0;

  for (const seed of seeds) {
    setSubscriptions({});
    const config = randomConfig(seed);
    const drawId = `no-codes-${seed}`;
    prepareDraw(config, drawId);
    replay(config, generateSchedule(config, drawId, 30), drawId);

    const drawDefinition = getDrawDefinition(drawId);
    for (const structure of drawDefinition?.structures ?? []) {
      for (const matchUp of structure.matchUps ?? []) {
        const at = `seed ${seed} ${structure.structureName} r${matchUp.roundNumber}p${matchUp.roundPosition}`;
        expect(Object.hasOwn(matchUp, 'matchUpStatusCodes'), `${at} holds positional codes`).toEqual(false);
        if (matchUp.sideExitProvenance) exitsSeen += 1;
        for (const [side, code] of Object.entries(matchUp.sideStatusCodes ?? {})) {
          expect(['1', '2'].includes(side) && typeof code === 'string', `${at} reason ${side}: ${code}`).toEqual(true);
        }
      }
    }
  }

  // the control: a run producing no exits at all would pass vacuously
  expect(exitsSeen).toBeGreaterThan(0);
  // AN EXPLICIT TIMEOUT: eight sweep schedules contend with the full suite under `verify:coverage`.
}, 180_000);
