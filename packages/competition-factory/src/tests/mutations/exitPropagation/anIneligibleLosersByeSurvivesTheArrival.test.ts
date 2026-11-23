import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * AN INELIGIBLE LOSER'S BYE SURVIVES THE OPPONENT'S ARRIVAL — census 9700084 (FIRST_MATCH_LOSER_CONSOLATION 8/8), the
 * early-exit arm (`exitBeforeArrivalCensus`).
 *
 * Tillich wins round 1 and reaches `Main|2|1` alone; a WALKOVER is recorded against him there, the empty side awarded.
 * He has a win, so he is not a first-match loser: the consolation seat fed by `Main|2|1`'s loser rightly becomes a
 * BYE (`Consolation|2|1 [BYE v ·]`). Then Crane wins `Main|1|2` and arrives in `Main|2|1` — he takes the walkover and
 * goes on, exactly as a direct entry would have it — and the arrival takes that BYE back without putting it back:
 * `Consolation|2|1` is left `[1:- v 3:Calvino]`, a seat nobody can ever fill, and Calvino stalls.
 *
 * Entered the other way round (Crane arrives first, then the walkover is recorded against Tillich), the BYE stands.
 * The two orders are pinned equal on the consolation.
 */

const DRAW_ID = 'an-ineligible-losers-bye-survives-the-arrival';

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
    seed: 9700084,
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
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }
  const view = (key: string) => {
    const { matchUpStatus, winningSide, sides } = at(key);
    return {
      participants: (sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      matchUpStatus,
      winningSide,
    };
  };
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    consolation: ['Consolation|1|1', 'Consolation|2|1', 'Consolation|3|1'].map(view),
    main: view('Main|2|1'),
    stalls: inconsistencies.filter((i: any) => i.issueType === STALLED_POSITION).length,
  };
}

const EARLY_WALKOVER: [string, any] = ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }];
const CRANE_ARRIVES: [string, any] = ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 2 }];
const REST: [string, any][] = [
  ['Main|1|3', { winningSide: 1 }],
  ['Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['Main|2|2', { winningSide: 1 }],
  ['Consolation|2|2', { winningSide: 1 }],
];

it('the bye for a loser who is not a first-match loser stands when his opponent arrives', () => {
  const direct = play([['Main|1|1', { winningSide: 1 }], CRANE_ARRIVES, EARLY_WALKOVER, ...REST]);
  const early = play([['Main|1|1', { winningSide: 1 }], EARLY_WALKOVER, CRANE_ARRIVES, ...REST]);
  expect(direct.main).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 2 });
  expect(direct.consolation[1]).toMatchObject({ matchUpStatus: BYE, participants: ['BYE', expect.any(String)] });
  expect(early).toEqual(direct);
  expect(early.stalls).toEqual(0);
});
