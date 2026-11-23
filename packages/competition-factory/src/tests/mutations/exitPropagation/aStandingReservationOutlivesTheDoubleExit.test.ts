import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A STANDING CONSOLATION RESERVATION OUTLIVES A DOUBLE EXIT RE-ENTERED BESIDE IT — census 20163074
 * (FIRST_MATCH_LOSER_CONSOLATION 8/8, propagation off, every arm) and 20139307 (8/7).
 *
 * `Main|1|3` and `Main|1|4` played, so whoever loses `Main|2|2` will have a prior win and the FIRST_MATCHUP link will not
 * carry them: `propagateConsolationBye` reserves `Consolation|2|2`'s fed seat with a BYE, marked `byeFromPropagation` so
 * its own withdrawal can recognise it. `Main|2|2` entered as a double exit leaves it. Re-entered as the OTHER double
 * exit, the unwind read the marker as a BYE its cascade had placed and removed it, and nothing put it back beside the
 * standing exit: the participant in `Consolation|2|2` waited on a seat nobody can fill (STALLED_POSITION).
 */

const DRAW_ID = 'standing-reservation';

function setup() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 8, drawId: DRAW_ID }],
    setState: true,
  });
}

const at = (structureName: string, roundNumber: number, roundPosition: number): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );

function enter(roundNumber: number, roundPosition: number, outcome: any) {
  const { matchUpId } = at('Main', roundNumber, roundPosition);
  const result = tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId, outcome });
  expect(result.error).toBeUndefined();
}

/** the fed seat, as the consolation reads it */
function fedSeat() {
  const { matchUpStatus, sides } = at('Consolation', 2, 2);
  return { matchUpStatus, byes: sides.filter((side: any) => side?.bye).length };
}

it.each([
  [DOUBLE_DEFAULT, DOUBLE_WALKOVER],
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT],
])('a played first round reserves the fed seat, and %s re-entered as %s leaves it reserved', (first, second) => {
  setup();
  enter(1, 3, { winningSide: 1 });
  enter(1, 4, { winningSide: 1 });
  expect(fedSeat()).toEqual({ matchUpStatus: BYE, byes: 1 });

  enter(2, 2, { matchUpStatus: first });
  enter(2, 2, { matchUpStatus: second });
  expect(fedSeat()).toEqual({ matchUpStatus: BYE, byes: 1 });
});

// CONTROL: with walkovers in the first round, the loser of `Main|2|2` would be playing their first match, so nothing is
// reserved, and the BYE in the fed seat is the double exit's own — withdrawn when the double exit is
it('a walked-over first round reserves nothing, and the double exit takes back the bye it placed', () => {
  setup();
  enter(1, 3, { matchUpStatus: WALKOVER, winningSide: 1 });
  enter(1, 4, { matchUpStatus: WALKOVER, winningSide: 1 });
  expect(fedSeat()).toEqual({ matchUpStatus: TO_BE_PLAYED, byes: 0 });

  enter(2, 2, { matchUpStatus: DOUBLE_WALKOVER });
  expect(fedSeat()).toEqual({ matchUpStatus: BYE, byes: 1 });
  enter(2, 2, { matchUpStatus: TO_BE_PLAYED });
  expect(fedSeat()).toEqual({ matchUpStatus: TO_BE_PLAYED, byes: 0 });
});
