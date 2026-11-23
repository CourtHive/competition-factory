import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * AN ARRIVAL ENTRY TELLS THE TRUTH (ARRIVAL_TRUE; census intgate 8ce439f1ec, 92 findings across 76 seeds).
 *
 * An arrival entry (`{ previousMatchUpStatus, sourceMatchUpId }`, no `matchUpStatus`) says the side's occupant won
 * `sourceMatchUpId` with that status and came here. Two writers made one false:
 *
 * 1. A FLIP (`allowChangePropagation`, a different winner: `swapWinnerLoser`) relabels the new winner into the old
 *    winner's seat and leaves the entry naming the old result. Every "says X where Y is Z" finding (63, all in the
 *    flag-ON arm) was a flip; `refreshArrivals` rewrote the entry only on a same-winner re-score.
 * 2. A DOUBLE EXIT recorded its paired feeder's status as an arrival while that feeder was a PENDING single exit
 *    (an exit with no winner, its other seat still empty). It has delivered nobody, so the side it feeds has no
 *    origin yet. Every "names X, which is undecided" finding (29, every arm) was this, at
 *    `doubleExitAdvancement`'s `deliveredStatus`.
 */

const CONFIG = { drawType: SINGLE_ELIMINATION, propagateExitStatus: true, participantsCount: 16, drawSize: 16 };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(drawId: string, steps: [string, any][]) {
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const observed = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(observed.thrown).toBeUndefined();
    expect(observed.error).toBeUndefined();
  }
  return Object.fromEntries(getDrawMatchUps(drawId).map((matchUp: any) => [coordinate(matchUp), matchUp]));
}

/** every arrival entry names a decided source whose status it records: the census property, asked locally */
function falseArrivals(drawId: string): string[] {
  const matchUps = getDrawMatchUps(drawId);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  const found: string[] = [];
  for (const matchUp of matchUps) {
    for (const [side, entry] of Object.entries(matchUp.sideExitProvenance ?? {}) as [string, any][]) {
      if (!entry?.sourceMatchUpId || entry.matchUpStatus) continue;
      const source: any = byId.get(entry.sourceMatchUpId);
      if (!source?.winningSide || source.matchUpStatus !== entry.previousMatchUpStatus)
        found.push(`${coordinate(matchUp)} side ${side}`);
    }
  }
  return found;
}

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

it('a flipped result rewrites the arrival its new winner holds onward', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  setSubscriptions({});
  const drawId = 'arrival-after-a-flip';
  prepareDraw({ ...CONFIG, seed: 9100138 }, drawId);
  const draw = play(drawId, [
    ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|1|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|1|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }],
  ]);
  const source = draw['Main|1|1'];
  const onward = draw['Main|2|1'];
  const [winner] = source.sides.filter((side: any) => side.sideNumber === source.winningSide);
  const side = onward.sides.find((s: any) => s.participantId === winner.participantId)?.sideNumber;
  expect(side).toBeDefined();
  expect(onward.sideExitProvenance?.[side]).toEqual({
    previousMatchUpStatus: RETIRED,
    sourceMatchUpId: source.matchUpId,
  });
  expect(falseArrivals(drawId)).toEqual([]);
});

it('a double exit beside a pending walkover records no arrival from it', () => {
  setSubscriptions({});
  const drawId = 'arrival-beside-a-pending-exit';
  prepareDraw({ ...CONFIG, seed: 9000221 }, drawId);
  const draw = play(drawId, [
    ['Main|1|1', { winningSide: 1 }],
    ['Main|1|2', { winningSide: 1 }],
    // Main|2|2 becomes a pending walkover: its side 2 awaits Main|1|4's winner
    ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(draw['Main|2|2'].matchUpStatus).toEqual(WALKOVER);
  expect(draw['Main|2|2'].winningSide).toBeUndefined();
  const pending = draw['Main|2|2'].matchUpId;
  const entries = Object.values(draw['Main|3|1'].sideExitProvenance ?? {}) as any[];
  expect(entries.some((entry) => entry?.sourceMatchUpId === pending)).toEqual(false);
  expect(falseArrivals(drawId)).toEqual([]);

  // once Main|1|4 is decided, its winner wins the walkover and arrives: forward play records that arrival
  const after = play(drawId, [['Main|1|4', { winningSide: 1 }]]);
  expect(after['Main|2|2'].winningSide).toBeDefined();
  expect(falseArrivals(drawId)).toEqual([]);
});
