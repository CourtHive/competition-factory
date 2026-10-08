import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A CONSOLATION RESERVATION FOLLOWS THE FIRST ROUND — census 20030739 (FIRST_MATCH_LOSER_CONSOLATION 8/8,
 * `allowChangePropagation`).
 *
 * Once both first-round feeders of `Main|2|1` are won on the court, whoever loses it has a prior win and may not enter
 * the consolation, so `Consolation|2|1`'s fed seat is reserved with a BYE. A WALKOVER is not a win on the court, so while
 * `Main|1|1` is one there is no reservation. Re-scoring `Main|1|1` as a played result by the same winner must then place
 * it, exactly as entering that result directly does.
 *
 * The reservation was asked only when a winner was DIRECTED into `Main|2|1`. Once the consolation has a result, the
 * same-winner correction no longer re-directs anybody — it changes the score where it stands — so the seat
 * stayed empty; `Main|2|1` later became a double walkover, and `Consolation|2|1`'s participant, and the one waiting in
 * `Consolation|3|1` past the other seat's BYE, waited for nobody.
 */

const DRAW_ID = 'consolation-reservation-follows-first-round';

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
    propagateExitStatus: false,
    participantsCount: 8,
    seed: 20030739,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: false,
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

const WALKED_OVER: [string, any][] = [
  ['Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|1|2', { winningSide: 1 }],
];

it('no reservation while a feeder is a walkover', () => {
  expect(play(WALKED_OVER).sides).not.toContain(BYE);
});

it('re-scored as a played win once the consolation has started, the reservation is placed', () => {
  // a first-round consolation result means the correction no longer re-directs `Main|1|1`'s winner
  const direct = play([
    ['Main|1|1', { winningSide: 1 }],
    ['Main|1|2', { winningSide: 1 }],
    ['Consolation|1|1', { winningSide: 2 }],
  ]);
  const corrected = play([...WALKED_OVER, ['Consolation|1|1', { winningSide: 2 }], ['Main|1|1', { winningSide: 1 }]]);
  expect(direct.sides).toContain(BYE);
  expect(corrected).toEqual(direct);
});

it('census 20030739: a double walkover after the correction leaves nobody waiting', () => {
  const corrected = play([
    ...WALKED_OVER,
    ['Consolation|1|1', { winningSide: 2 }],
    ['Main|1|1', { winningSide: 1 }],
    ['Main|1|1', { winningSide: 2 }],
    ['Main|1|3', { winningSide: 2 }],
    ['Main|1|4', { winningSide: 2 }],
    ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Consolation|1|2', { winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(corrected.sides).toContain(BYE);
  expect(corrected.stalls).toEqual(0);
});
