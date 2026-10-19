import { checkIntegrity, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * A REMOVAL WALKS THROUGH A HOLE INTO THE MATCHUP ITS OWN MATCHUP FEEDS (census S8, FEED_IN_CHAMPIONSHIP_TO_SF 8/7,
 * seed 20650915, policy off and allow-change-propagation; COMPASS 32/27 20611808 is the same shape).
 *
 * `Main|1|2`'s double default leaves `Main|2|1` a DEFAULTED whose loser is nobody: a propagated BYE at `Consolation`
 * dp 2, alone in `Consolation|2|2`. `Consolation|1|2`'s double walkover produces a walkover there, which meets that BYE
 * and is carried past it into `Consolation|3|1`, through the hole beside dp 2. Re-scoring `Main|1|2` as a walkover
 * dissolves the DEFAULTED and takes the BYE back. The carry past it comes back with it ("a carry past a BYE a holder
 * takes back comes back with it"), so the removal of dp 2 has to walk on, through the hole, into `Consolation|3|1`.
 *
 * `aRemovalWalksOnlyThroughARealPartner` stopped every walk through a hole, because asking the next round for ANY pair
 * holding one reset a matchUp the position never reached. With no walk at all the carry stayed in `Consolation|3|1`;
 * the walkover loser `Main|1|2` sent to `Consolation` dp 4 passed its BYEs into `3|1` carrying their own walkover,
 * converged with the stale carry, and the convergence was then withdrawn to a WALKOVER whose exit code sat on its
 * winner (EXIT_CODE_ON_WINNER_SIDE). The walk goes on through a hole only into the matchUp the lone matchUp feeds.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  propagateExitStatus: true,
  participantsCount: 7,
  drawSize: 8,
  seed: 20650915,
};
const SCHEDULE = [
  at('Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|1|4', { winningSide: 1 }),
  at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Consolation|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
];
const CORRECTION = SCHEDULE.at(-1) as Step;

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const target = find(coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
    expect(observed.error).toBeUndefined();
  }
  return { find, integrity: checkIntegrity(drawId, '-') };
}

const carriedFrom = (matchUp: any) =>
  Object.values(matchUp?.sideExitProvenance ?? {})
    .map((entry: any) => entry?.sourceMatchUpId)
    .filter(Boolean);

it('the census schedule leaves a consistent draw', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'removal-through-hole')).toBeNull();
});

it('before the correction the produced walkover is carried past the BYE into the matchUp it feeds', () => {
  const { find } = play(SCHEDULE.slice(0, -1), 'removal-through-hole-before');
  const producer = find('Consolation|1|2');
  expect(find('Consolation|2|2').matchUpStatus).toEqual('BYE');
  expect(carriedFrom(find('Consolation|3|1'))).toContain(producer.matchUpId);
});

it('taking the BYE back brings the carry back out of the matchUp it fed', () => {
  const { find, integrity } = play(SCHEDULE, 'removal-through-hole-after');
  expect(integrity).toEqual([]);
  const producer = find('Consolation|1|2');
  const passedInto = find('Consolation|3|1');
  // the carry is no longer one round on, beside the walkover loser who reached that matchUp in its place
  expect(carriedFrom(passedInto)).not.toContain(producer.matchUpId);
  expect(passedInto.matchUpStatus).toEqual(WALKOVER);
  // the walkover loser arriving through their BYEs carries their own walkover there, and loses it
  const walkoverLoser = find(coordinate(CORRECTION)).sides.find((side: any) => side.sideNumber === 2).participantId;
  const loserSide = passedInto.sides.find((side: any) => side?.participantId === walkoverLoser);
  expect(loserSide).toBeDefined();
  expect(passedInto.winningSide).toBeDefined();
  expect(passedInto.winningSide).not.toEqual(loserSide.sideNumber);
});
