import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A LATER-ROUND AWARD IS NOT A FIRST-ROUND WALKOVER — census 20064548 (FIRST_MATCH_LOSER_CONSOLATION 8/8).
 *
 * Both first-round feeders of `Main|2|1` are won on the court, so `Consolation|2|1`'s fed seat is reserved with a BYE:
 * whoever loses `Main|2|1` has a prior win and may not enter. `Main|2|2` is a double default, so `Main|2|1`'s winner
 * reaches the final and is awarded it (DEFAULTED). Re-scoring `Main|2|1` as a DOUBLE_DEFAULT unwinds that winner, and
 * the unwind asks whether the winner reached `Main|2|1` by a BYE or walkover — if so, the BYE in the fed seat was for
 * the loser, and goes. The question read every round the winner's drawPosition stood in, the final included, so the
 * award there answered yes and the reservation was removed. Entered directly, the double default keeps it.
 *
 * A later walkover in `Main|1|2` then sent its loser into `Consolation|1|1` carrying the exit, the other participant
 * advanced into `Consolation|2|1`, and waited on a seat nobody could fill (`Consolation|2|1`, `Consolation|3|1`).
 */

const DRAW_ID = 'later-round-award-keeps-the-reservation';

const at = (key: string): any => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === Number(roundNumber) &&
        matchUp.roundPosition === Number(roundPosition),
    );
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 20064548,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const consolation = at('Consolation|2|1');
  return {
    sides: consolation.sides.map((side: any) => (side.bye ? BYE : (side.participantId ?? null))),
    matchUpStatus: consolation.matchUpStatus,
    stalls: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
      (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
    ).length,
  };
}

// the final is awarded to whoever wins `Main|2|1`: `Main|2|2` is a double default
const FIRST_ROUND_PLAYED: [string, any][] = [
  ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|2', { winningSide: 2 }],
  ['Main|1|1', { winningSide: 1 }],
];

it('re-scored as a double default while its winner stands awarded in the final, the reservation stays', () => {
  const direct = play([...FIRST_ROUND_PLAYED, ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }]]);
  const corrected = play([
    ...FIRST_ROUND_PLAYED,
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);
  expect(direct.sides).toContain(BYE);
  expect(corrected).toEqual(direct);
});

it('census 20064548: a later first-round walkover leaves nobody waiting', () => {
  const corrected = play([
    ...FIRST_ROUND_PLAYED,
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ]);
  expect(corrected.sides).toContain(BYE);
  expect(corrected.stalls).toEqual(0);
});
