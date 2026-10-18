import {
  getDrawMatchUps,
  getDrawDefinition,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import {
  BYE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A RELEASED POSITION TAKES ITS BYE ORIGIN WITH IT (census A1 int2, provenance set: 40 of 51 rows that lost a BYE
 * origin in the round trip; COMPASS 8/8, `propagateExitStatus: false`, seed 21031039).
 *
 * `East|1|4`'s double default places a propagated BYE in the West. `West|1|2`'s occupant advances past it into
 * `West|2|1`, and `West|1|1`'s double walkover produces a walkover opposite them, so `West|2|1` records the pair: the
 * walkover's entry and, beside it, `{ BYE, BYE }` naming `West|1|2`. Re-scoring `East|1|4` as a played win takes the
 * BYE back: `West|1|2` holds two participants and is to be played, and `releaseAdvancedDrawPosition` takes the occupant
 * back out of `West|2|1`. It withdrew the arrival entries naming the feeder that delivered them (A1 group R4), not the
 * BYE origin naming the same feeder, so `West|2|1` kept a BYE origin from a matchUp that is no longer a BYE. Every
 * other entry order reaches the draw without it (12 of 12 on the census case behind this pin's sibling, COMPASS 16/16
 * 21052035), and the first probe-and-clear that re-derives `West|2|1` drops it, which the census reported as a
 * DO_UNDO_IDENTITY residue.
 */

const CLEAR = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

/** every `{ BYE, BYE }` origin that names a matchUp which is not a BYE */
function falseByeOrigins(drawId: string): string[] {
  const matchUps = getDrawMatchUps(drawId);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  return matchUps.flatMap((matchUp: any) =>
    Object.entries(matchUp.sideExitProvenance ?? {})
      .filter(([, entry]: [string, any]) => entry?.matchUpStatus === BYE)
      .filter(([, entry]: [string, any]) => byId.get(entry.sourceMatchUpId)?.matchUpStatus !== BYE)
      .map(([side]) => `${coordinate(matchUp)} side ${side}`),
  );
}

const CONFIG = { drawType: COMPASS, propagateExitStatus: false, participantsCount: 8, drawSize: 8, seed: 21031039 };
const STEPS = [
  at('East|1|3', { winningSide: 2 }),
  at('East|1|4', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|1', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('West|1|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|4', { winningSide: 2 }),
];
const PROBE = at('West|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 });

/** The census replay: a step whose matchUp does not hold two participants is skipped. */
function schedule(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of STEPS) {
    const target = find(drawId, coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus: false, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
}

it('a BYE taken back leaves no BYE origin naming the matchUp it held', () => {
  const drawId = 'released-bye-origin';
  schedule(drawId);
  expect(find(drawId, 'West|1|2').matchUpStatus).not.toEqual(BYE);
  expect(falseByeOrigins(drawId)).toEqual([]);
});

it('so a probe and its clear return the draw to where it was', () => {
  const drawId = 'released-bye-origin-round-trip';
  schedule(drawId);
  const before = projectDraw(getDrawDefinition(drawId));
  const { matchUpId } = find(drawId, coordinate(PROBE));
  const forward = observeMutation({ propagateExitStatus: false, matchUpId, outcome: PROBE.outcome, drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ propagateExitStatus: false, matchUpId, outcome: CLEAR, drawId });
  expect(cleared.error).toBeUndefined();
  expect(projectDraw(getDrawDefinition(drawId))).toEqual(before);
});
