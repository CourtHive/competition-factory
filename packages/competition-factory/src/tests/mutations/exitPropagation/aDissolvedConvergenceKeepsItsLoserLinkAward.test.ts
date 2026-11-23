import { getDrawMatchUps, observeMutation, projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DISSOLVED CONVERGENCE KEEPS AN AWARD THAT CAME DOWN ITS LOSER LINK (census A1 R9, COMPASS 32/31 seed 20551581
 * under `doubleExitPropagateBye: false`, the census schedule of `aLoserSeatHoldingAByeIsNotConverged`).
 *
 * `East|1|9` and `East|1|10` default into `West|1|5`, a double default whose produced DEFAULTED comes straight down
 * its loser link into `South|1|3` dp 5. Opposite it, dp 6 waits for `West|1|6`'s loser, and direct entry awards the
 * exit to that seat (ws 2) and reserves dp 6 in `South|2|2` ("A produced exit awards no empty seat, on any path" keeps
 * a carried exit's award, and one that came straight down its loser link: `exitStatusClearing` 2.3, CA 2026-09-19).
 * When `West|1|6` is first won over `East|1|11`'s carried walkover, its loser carries that walkover into dp 6 and
 * `South|1|3` converges to a double walkover. Correcting `East|1|11` to a played win withdraws the carry: the loser
 * leaves dp 6 and the convergence dissolves to the kept DEFAULTED. "A convergence a correction dissolves settles as the
 * kept exit alone would leave it ... one that came straight down its link keeps its award to that seat"
 * (exit-propagation.md). `withdrawFromMatchUp`'s `awardsEmptySeat` took the award back regardless of the link, so the
 * DEFAULTED stood pending and dp 6 was never reserved: forward play reached one state in every order of the standing
 * results entered once each, and another when a result was corrected on the way.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 31, drawSize: 32, seed: 20551581 };
const DEFAULTED_1 = { matchUpStatus: DEFAULTED, winningSide: 1 };
const WALKOVER_1 = { matchUpStatus: WALKOVER, winningSide: 1 };
const WON_1 = { winningSide: 1 };

const CONVERGED_THEN_CORRECTED = [
  at('East|1|9', DEFAULTED_1),
  at('East|1|10', DEFAULTED_1),
  at('East|1|11', WALKOVER_1),
  at('East|1|12', WON_1),
  at('East|1|11', WON_1),
];
const ENTERED_ONCE = [
  at('East|1|9', DEFAULTED_1),
  at('East|1|10', DEFAULTED_1),
  at('East|1|11', WON_1),
  at('East|1|12', WON_1),
];

/** the draw's projection, each matchUpId named by its coordinate so that two draws compare */
function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(drawId);
  const find = (key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
  let projection = JSON.stringify(projectDraw(tournamentEngine.getEvent({ drawId }).drawDefinition));
  for (const matchUp of matchUps) projection = projection.replaceAll(matchUp.matchUpId, coordinate(matchUp));
  for (const structure of tournamentEngine.getEvent({ drawId }).drawDefinition.structures)
    projection = projection.replaceAll(structure.structureId, structure.structureName);
  // the legacy `matchUpStatusCodes` (index 4) are left out: their writers disagree across a round trip (census A1 F1,
  // exempt from the do-undo projection until 8.x removes the array), and the codes are not what this pins
  const structures = JSON.parse(projection).map((structure: any) => ({
    ...structure,
    matchUps: structure.matchUps.map((tuple: any[]) => tuple.filter((_: any, index: number) => index !== 4)),
  }));
  return { projection: structures, kept: find('South|1|3'), next: find('South|2|2') };
}

it('the convergence forms over the produced DEFAULTED and the carried walkover', () => {
  const { kept } = play(CONVERGED_THEN_CORRECTED.slice(0, 4), 'loser-link-award-converged');
  expect(kept.matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

it('dissolved, the produced DEFAULTED keeps its award to the seat awaiting its loser, and reserves it', () => {
  const { kept, next } = play(CONVERGED_THEN_CORRECTED, 'loser-link-award-dissolved');
  expect(kept.matchUpStatus).toEqual(DEFAULTED);
  expect(kept.winningSide).toEqual(2);
  expect(kept.sides.map((side: any) => side.participantId)).toEqual([undefined, undefined]);
  expect(next.drawPositions.filter(Boolean)).toEqual([6]);
});

it('the corrected schedule reaches the draw the results entered once reach', () => {
  const corrected = play(CONVERGED_THEN_CORRECTED, 'loser-link-award-corrected');
  const direct = play(ENTERED_ONCE, 'loser-link-award-direct');
  expect(direct.kept.winningSide).toEqual(2);
  expect(corrected.projection).toEqual(direct.projection);
});
