import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A CARRY WHOSE WINNER PLAYED ON PAST A BYE IS NOT WITHDRAWN BY A RELABEL AT ITS SOURCE.
 *
 * Census w1 9000087 (FMLC 16/13), shrunk to seven steps. `Main|1|3`'s walkover is carried into the consolation;
 * its winner there is advanced past a BYE and then wins `Consolation|3|1`, a played match. Relabelling `Main|1|3`
 * as a played win withdraws the carry only where neither the loser nor the carry's winner has played on (the
 * 2026-10-02 ruling, `relabelLoserExit`). `winnerPlayedOn` looked one matchUp on, found the BYE, which is passed and
 * not played, and withdrew the carry, releasing the winner from `Consolation|4|1`, a round they had reached by
 * that result (WINNER_NOT_ADVANCED). It now follows the winner past BYEs to their next real matchUp.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 13,
  drawSize: 16,
  seed: 9000087,
};
const steps = [
  at('Main|1|2', { winningSide: 2 }),
  at('Main|1|4', { winningSide: 1 }),
  at('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Main|2|2', { winningSide: 1 }),
  at('Consolation|3|1', { winningSide: 2 }),
  at('Main|1|3', { winningSide: 1 }),
];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'played-on-replay')).toBeNull();
});

it('the winner of Consolation|3|1 stays in the round that result took them to', () => {
  const drawId = 'played-on';
  setSubscriptions({});
  prepareDraw(config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: find(key(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const won = find('Consolation|3|1');
  // CONTROL: the shape is reached, a played result in Consolation|3|1
  expect(won.winningSide).toBeDefined();
  const winner = won.sides.find((side: any) => side.sideNumber === won.winningSide).participantId;
  expect(find('Consolation|4|1').sides.map((side: any) => side.participantId)).toContain(winner);
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
