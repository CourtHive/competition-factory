import { generateSchedule, prepareDraw, randomConfig, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * When two exits MEET, which double exit the matchUp becomes is derived from what each side carried.
 *
 * `progressExitStatus` RULE 4 hardcoded `DOUBLE_WALKOVER` for every convergence, so a
 * default-on-default pair was relabelled a walkover — and since `producedExitStatus` maps
 * `DOUBLE_DEFAULT` to `DEFAULTED`, the relabelling propagated a `WALKOVER` downstream where a
 * `DEFAULTED` belonged.
 *
 * CA, 2026-09-12: *"a DOUBLE_DEFAULT producing a side record DEF sounds right, the same as a
 * DOUBLE_WALKOVER producing a WO / WALKOVER sounds right; my assertion was a WALKOVER and a DEFAULT
 * would produce a WALKOVER, not a DEF."* So a uniform pair keeps its flavour and any MIXTURE
 * collapses to `DOUBLE_WALKOVER`, whose production is the unattributed walkover.
 *
 * The asymmetry is about attribution: a default is a referee's finding against a named player, and
 * in a mixed convergence one side merely failed to appear. `courthive-components`
 * `renderParticipant.ts:113`/`:48` render this matchUp-level status per PARTICIPANT, so the stronger
 * claim would put a `DEF` badge beside an innocent name.
 */

it.each([
  { label: 'both walkovers', sides: [WALKOVER, WALKOVER], expected: DOUBLE_WALKOVER },
  { label: 'both defaults', sides: [DEFAULTED, DEFAULTED], expected: DOUBLE_DEFAULT },
  { label: 'a default meeting a walkover', sides: [DEFAULTED, WALKOVER], expected: DOUBLE_WALKOVER },
  { label: 'a walkover meeting a default (order reversed)', sides: [WALKOVER, DEFAULTED], expected: DOUBLE_WALKOVER },
  { label: 'the double flavours, both default', sides: [DOUBLE_DEFAULT, DEFAULTED], expected: DOUBLE_DEFAULT },
  { label: 'a retirement is not default-flavoured', sides: [RETIRED, DEFAULTED], expected: DOUBLE_WALKOVER },
  { label: 'an unknown side does not force a default', sides: [DEFAULTED, undefined], expected: DOUBLE_DEFAULT },
  { label: 'nothing known at all', sides: [undefined, undefined], expected: DOUBLE_WALKOVER },
])('$label collapses to $expected', ({ sides, expected }) => {
  expect(collapseDoubleExitStatus(sides)).toEqual(expected);
});

it('is order-invariant for every pair', () => {
  const statuses = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT, undefined];
  for (const first of statuses) {
    for (const second of statuses) {
      expect(
        collapseDoubleExitStatus([first, second]),
        `[${first}, ${second}] must collapse the same way as its reverse`,
      ).toEqual(collapseDoubleExitStatus([second, first]));
    }
  }
});

it('never persists a matchUpStatusCodes array containing a hole', () => {
  // `progressExitStatus` RULE 4 assigned `sourceCode` — `undefined` for a directly-recorded exit —
  // into BOTH slots by hand, and PERSISTED the result: `[undefined, undefined]`, which serialises to
  // `[null, null]` and is not a `string[]`. It is also load-bearing in RULE 4's own `opponentEmpty`
  // gate, which tests `statusCodes.length === 0`. CA: *"we can't be persisting
  // [undefined, undefined]."*
  //
  // Driven through the sweep harness rather than by hand: a hand-built convergence did NOT reproduce
  // it, so that version of this test passed against the unfixed tree and was vacuous. Measured on
  // the unfixed tree across the first 120 seeds of the window: 14 persisted hole arrays, including
  // the mixed shape `[null, ""]` which also evidences the index-0 read this replaced.
  const seeds = [9000003, 9000056, 9000074];
  let arraysSeen = 0;

  for (const seed of seeds) {
    setSubscriptions({});
    const config = randomConfig(seed);
    const drawId = `no-hole-${seed}`;
    prepareDraw(config, drawId);
    replay(config, generateSchedule(config, drawId, 30), drawId);

    const drawDefinition = getDrawDefinition(drawId);
    for (const structure of drawDefinition?.structures ?? []) {
      for (const matchUp of structure.matchUps ?? []) {
        const codes = matchUp.matchUpStatusCodes;
        if (!Array.isArray(codes) || !codes.length) continue;
        arraysSeen += 1;
        for (const [index, code] of codes.entries()) {
          expect(
            code === undefined || code === null,
            `seed ${seed} ${structure.structureName} r${matchUp.roundNumber}p${matchUp.roundPosition} codes[${index}] is a hole: ${JSON.stringify(codes)}`,
          ).toEqual(false);
        }
      }
    }
  }

  // the control: a run producing no codes at all would pass vacuously
  expect(arraysSeen).toBeGreaterThan(0);
});
