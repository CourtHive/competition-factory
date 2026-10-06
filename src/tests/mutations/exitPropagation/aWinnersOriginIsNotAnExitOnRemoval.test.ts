import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A WINNER'S ORIGIN IS NOT AN EXIT WHEN A REMOVAL RE-DERIVES THE MATCHUP IT SITS ON.
 *
 * Census w2 9100115 (FRLC 16/16, propagation on), shrunk to seven steps and traced by factory-d3. A participant wins
 * `Consolation|1|3` against an opponent who carried a walkover in, passes a BYE, and arrives in `Consolation|2|2`
 * carrying the record of where they came from: `WALKOVER>WALKOVER`, the winner's origin (P19: provenance records
 * arrivals as well as exits). Re-scoring `Main|1|7` from a double walkover takes the BYE back and a removal reaches
 * `updateMatchUpStatusAfterRemoval`, which re-derived the matchUp from what it retained. Read by status alone, the
 * winner's origin is an exit they carried, so `Consolation|2|2` became a WALKOVER won by the newcomer opposite, who
 * then advanced from it. `withoutWinnersOrigins` is the reading `removeDoubleExit`'s withdrawal already applies
 * (census 9100303); the removal now applies it too, and drops the origin with the decision, as that withdrawal does:
 * an undecided matchUp carries no origin (ORIGIN_ON_UNDECIDED_MATCHUP, which a first version of this fix tripped on
 * census w1 9000004, 9000347, 9000463 and de 9301998).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = {
  drawType: FIRST_ROUND_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 16,
  seed: 9100115,
  drawSize: 16,
};
const steps = [
  at('Main|1|5', { winningSide: 1 }),
  at('Main|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|7', { winningSide: 2 }),
  at('Main|1|5', { winningSide: 2 }),
  at('Main|1|8', { winningSide: 2 }),
];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(drawId: string, schedule: Step[]) {
  setSubscriptions({});
  prepareDraw(config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of schedule) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(key(step)).matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  return find;
}

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'winners-origin')).toBeNull();
});

it("the removal leaves the matchUp undecided, and the winner's origin goes with the decision", () => {
  const before = play('winners-origin-before', steps.slice(0, 4))('Consolation|2|2');
  // CONTROL: before the removal, side 1 holds a winner's origin naming the matchUp its participant won
  expect(before.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(WALKOVER);
  expect(before.sideExitProvenance?.[1]?.matchUpStatus).toEqual(WALKOVER);

  const find = play('winners-origin', steps.slice(0, 5));
  const meeting = find('Consolation|2|2');
  // CONTROL: both seats are held, so a walkover awarded here would advance someone
  expect(meeting.sides.filter((side: any) => side.participantId)).toHaveLength(2);
  expect(meeting.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(meeting.winningSide).toBeUndefined();
  // an undecided matchUp carries no origin (ORIGIN_ON_UNDECIDED_MATCHUP), and nothing advanced from it
  expect(meeting.sideExitProvenance?.[1]).toBeUndefined();
  expect(find('Consolation|3|1').drawPositions?.filter(Boolean) ?? []).toEqual([]);
});

it('matches the same results entered in their final order', () => {
  const read = (find: (coordinate: string) => any) =>
    ['Consolation|2|2', 'Consolation|3|1'].map((coordinate) => {
      const { matchUpStatus, winningSide, drawPositions } = find(coordinate);
      return { coordinate, matchUpStatus, winningSide, drawPositions };
    });
  const direct = read(play('winners-origin-direct', steps.slice(3)));
  const corrected = read(play('winners-origin', steps));
  expect(corrected).toEqual(direct);
});
