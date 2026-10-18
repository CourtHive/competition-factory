import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A REMOVED POSITION TAKES ITS ARRIVAL WITH IT, in every round it leaves (census A1 int2, provenance set: all 31
 * ARRIVAL_TRUE rows; SINGLE_ELIMINATION 16/14, `propagateExitStatus: true`, seed 21137642).
 *
 * `Main|1|5`'s double walkover produces a walkover into `Main|2|3`, which `Main|1|6`'s winner is awarded. `Main|2|4`'s
 * double walkover produces another into `Main|3|2`, and the same participant, arriving there from `Main|2|3`, is
 * awarded that one too; `Main|3|2` records their arrival from `Main|2|3`. Clearing `Main|1|6` takes them back out of
 * both rounds (`removeSubsequentRoundsParticipant`). The arrival naming `Main|1|6` in `Main|2|3` went with them; the
 * one naming `Main|2|3` in `Main|3|2` stayed, naming a matchUp that is undecided again (ARRIVAL_TRUE). The release
 * path already takes a position's arrival with it (`releaseAdvancedDrawPosition`, A1 group R4); this is the removal
 * path, round by round.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

/** every arrival entry (no `matchUpStatus`) whose source is undecided */
function arrivalsFromUndecided(drawId: string): string[] {
  const matchUps = getDrawMatchUps(drawId);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, matchUp]));
  return matchUps.flatMap((matchUp: any) =>
    Object.entries(matchUp.sideExitProvenance ?? {})
      .filter(([, entry]: [string, any]) => entry?.sourceMatchUpId && !entry.matchUpStatus)
      .filter(([, entry]: [string, any]) => !byId.get(entry.sourceMatchUpId)?.winningSide)
      .map(([side]) => `${coordinate(matchUp)} side ${side}`),
  );
}

const CONFIG = {
  drawType: SINGLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 14,
  drawSize: 16,
  seed: 21137642,
};
const STEPS = [
  at('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|7', { winningSide: 2 }),
  at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|2|4', { matchUpStatus: DOUBLE_WALKOVER }),
];
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };

it('a cleared result takes its winner and their arrival out of every round they reached', () => {
  const drawId = 'removed-arrival';
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of STEPS) {
    const { matchUpId } = find(drawId, coordinate(step));
    expect(
      observeMutation({ propagateExitStatus: true, matchUpId, outcome: step.outcome, drawId }).error,
    ).toBeUndefined();
  }
  const reached = find(drawId, 'Main|3|2');
  expect(reached.winningSide).toEqual(1);
  expect(reached.sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(find(drawId, 'Main|2|3').matchUpId);

  const { matchUpId } = find(drawId, 'Main|1|6');
  expect(observeMutation({ propagateExitStatus: true, matchUpId, outcome: CLEAR, drawId }).error).toBeUndefined();

  const left = find(drawId, 'Main|3|2');
  expect((left.drawPositions ?? []).filter(Boolean)).toEqual([]);
  expect(left.sideExitProvenance?.[1]).toBeUndefined();
  expect(arrivalsFromUndecided(drawId)).toEqual([]);
});
