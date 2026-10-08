import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEAD_RUBBER, DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * THE DOUBLE_ELIMINATION MAIN FINAL IS AWARDED TO THE SIDE THAT ARRIVES — read from the stored drawPositions, not from
 * a hydrated view the cascade has already outrun.
 *
 * The Main final seats the undefeated Main winner on SIDE 2 and the Backdraw's champion on the fed SIDE 1. When the
 * Backdraw produces no champion, side 1 holds a produced exit and the Main winner wins the final by it. Two census
 * seeds stranded that winner instead, both by re-scoring an upstream matchUp, and both because a side was read off an
 * `inContextDrawMatchUps` taken before the cascade moved positions:
 *
 *  - de 9300184 — `Main|3|1` a DOUBLE_DEFAULT, then corrected to a WALKOVER. The winner ARRIVES into the final's
 *    pending produced exit, and `applyPositionToMatchUp` asked `getExitWinningSide`, whose view did not yet hold the
 *    arrival, so its fed-round fallback answered side 1: the empty seat won, then the Backdraw's re-derived exit met
 *    that "recorded" exit and the final became a DOUBLE_WALKOVER with the winner alone in it.
 *  - de 9305831 (`allowChangePropagation`) — `Backdraw|3|1` a win, then corrected to a DOUBLE_DEFAULT. Its produced
 *    exit is relayed past the `Backdraw|4|1` BYE, and `advanceByeAdvancedDrawPosition` read the final's sides from a
 *    view still showing the Backdraw winner's seat the unwind had just removed: the Main winner was put on side 1, the
 *    final was awarded to the empty seat, and the winner waited alone in a Decider nobody could join.
 *
 * Each corrected path must end where forward play ends — the re-score invariant — and with nobody stalled.
 */

const DRAW_ID = 'de-final-arrival';

const config = (seed: number) => ({
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 5,
  drawSize: 8,
  seed,
});

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

function play(seed: number, steps: [string, any][], allowChangePropagation?: boolean) {
  setSubscriptions({});
  expect(prepareDraw(config(seed), DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      ...(allowChangePropagation ? { allowChangePropagation } : {}),
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const final = at('Main|4|1');
  const occupant = final.sides.find((side: any) => side.participantId);
  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  return {
    final: { matchUpStatus: final.matchUpStatus, winningSide: final.winningSide, occupantSide: occupant?.sideNumber },
    decider: at('Decider|1|1').matchUpStatus,
    stalls: stalls.length,
  };
}

it('de 9300184: the winner who arrives into a pending produced exit wins it, on the side they occupy', () => {
  const lead: [string, any][] = [
    ['Main|1|3', { winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|2', { winningSide: 2 }],
  ];
  const corrected = play(9300184, [
    ...lead,
    ['Main|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ]);
  const direct = play(9300184, [
    ...lead,
    ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ]);

  expect(direct.final).toEqual({ matchUpStatus: WALKOVER, winningSide: 2, occupantSide: 2 });
  expect(corrected.final).toEqual(direct.final);
  expect(corrected.stalls).toEqual(0);
});

it('de 9305831: an exit relayed past a BYE into the final after an unwind is not awarded to the empty seat', () => {
  const corrected = play(
    9305831,
    [
      ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|2', { winningSide: 2 }],
      ['Main|2|1', { winningSide: 2 }],
      ['Main|1|2', { winningSide: 1 }],
      ['Backdraw|3|1', { winningSide: 2 }],
      ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ],
    true,
  );
  const direct = play(
    9305831,
    [
      ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|1|2', { winningSide: 1 }],
      ['Main|2|1', { winningSide: 2 }],
      ['Backdraw|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ],
    true,
  );

  expect(direct.final).toEqual({ matchUpStatus: DEFAULTED, winningSide: 2, occupantSide: 2 });
  expect(direct.decider).toEqual(DEAD_RUBBER);
  expect(corrected.final).toEqual(direct.final);
  expect(corrected.decider).toEqual(DEAD_RUBBER);
  expect(corrected.stalls).toEqual(0);
});
