import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A RELABEL WITHDRAWS THE CARRY FROM A BYE-HELD MATCHUP — census 20030075 (FEED_IN_CHAMPIONSHIP 8/5).
 *
 * `Main|1|3` is a walkover; its loser carries the WALKOVER into `Consolation|2|2`. `Main|2|1`'s double default then
 * CLAIMS that matchUp's other seat as a BYE, so it reads BYE with the carry still recorded on the loser's side.
 * Relabelling `Main|1|3` as played must withdraw the carry (the 2026-10-02 relabel rule), but the relabel looked for
 * the loser's standing matchUp past every BYE, found no carry a round on, and withdrew nothing. Once `Main|2|1` was
 * re-entered, the stale carry decided `Consolation|2|2` as a WALKOVER whose winner never advanced, and
 * `Consolation|3|1` stalled. The corrected path must end where forward play ends.
 */

const DRAW_ID = 'relabel-bye-held-carry';

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
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 5,
    seed: 20030075,
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
  const state = (key: string) => {
    const matchUp = at(key);
    return {
      participants: matchUp.sides.map((side: any) => side.participantId ?? null),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
    };
  };
  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  return { c22: state('Consolation|2|2'), c31: state('Consolation|3|1'), stalls: stalls.length };
}

it('census 20030075: relabelling a walkover as played withdraws the carry a BYE claim was holding', () => {
  const corrected = play([
    ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|1|3', { winningSide: 2 }],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|3|1', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
  ]);
  const direct = play([
    ['Main|1|3', { winningSide: 2 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|3|1', { winningSide: 1 }],
  ]);

  expect(direct.c22.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(corrected).toEqual(direct);
  expect(corrected.stalls).toEqual(0);
});
