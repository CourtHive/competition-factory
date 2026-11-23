import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
  projectRoundTrip,
  normalize,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A BYE ADVANCE IS ASKED OF THE MATCHUP AS IT STANDS, not as the cascade first read it (census openings policy-off,
 * DO_UNDO_IDENTITY at the clear, OLYMPIC 32/32 under `doubleExitPropagateBye: false`: 21036479).
 *
 * `South|1|3` holds two propagated BYEs, so `South|2|2` holds the BYE it advanced on dp 6, and dp 7 has gone on past it
 * into `South|3|1`. `East|1|10`'s double walkover then converges the matchUp whose loser seat is `South` dp 5, which
 * shows the exit it produced (CA ruling (A), 2026-10-21): dp 5's BYE gives way, `South|2|2` loses dp 6's BYE, and the
 * walkover is relayed past dp 6 into `South|2|2`, pending opposite dp 7. Serving that walkover read `South|2|2` from the
 * view the cascade started from, where dp 6's BYE was still there, and advanced dp 7 into `South|3|1` again. Entered
 * with `East|1|10` first, nothing advances dp 7 past the pending walkover, and the probe's round trip (`East|1|11`'s
 * walkover converging `South|1|3` and its clear) settles there too.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);

const CONFIG = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 21036479 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const LAST: Step = ['East|1|10', { matchUpStatus: DOUBLE_WALKOVER }];
const SCHEDULE: Step[] = [
  ['East|1|9', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|2', { winningSide: 1 }],
  ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['East|1|15', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|12', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['East|1|8', { winningSide: 2 }],
  ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
];
const RETIREMENT: Step = [
  'East|1|7',
  { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
];
const PROBE: Step = ['East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }];

function apply(drawId: string, [key, outcome]: Step) {
  const target = find(getDrawMatchUps(drawId), key);
  const result = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
  expect(result.thrown).toBeUndefined();
  expect(result.error).toBeUndefined();
}

function drawAfter(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const step of steps) apply(drawId, step);
  return normalize(projectRoundTrip(getDrawDefinition(drawId)));
}

it('the double walkover entered last leaves dp 7 where entered first leaves it', () => {
  const last = drawAfter('bye-advance-last', [...SCHEDULE, LAST]);
  const southLast = getDrawMatchUps('bye-advance-last');
  expect(find(southLast, 'South|2|2')).toMatchObject({ matchUpStatus: WALKOVER, drawPositions: [5, 7] });
  expect(find(southLast, 'South|3|1').drawPositions ?? []).toEqual([]);
  expect(drawAfter('bye-advance-first', [LAST, ...SCHEDULE])).toEqual(last);
});

it("the probe's round trip returns the scheduled draw", () => {
  const drawId = 'bye-advance-round-trip';
  const before = drawAfter(drawId, [...SCHEDULE, LAST, RETIREMENT]);
  apply(drawId, PROBE);
  apply(drawId, [PROBE[0], clearOutcome]);
  expect(normalize(projectRoundTrip(getDrawDefinition(drawId)))).toEqual(before);
});
