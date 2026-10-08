import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A WITHDRAWN BYE KEEPS THE OTHER SIDE'S EXIT — census 20030617 (OLYMPIC 8/8, both `allowChangePropagation` arms).
 *
 * `East|1|1` and `East|1|2` are double exits, so both of `West|1|1`'s seats are claimed BYEs, and the two BYEs meeting
 * advance a BYE into `West|2|1` side 1. Side 2 holds the DEFAULTED that `West|1|2`'s double default produced. Then
 * `East|1|2` is corrected to a played win: its claim on `West|1|1` dp 2 is withdrawn, its loser takes that seat and
 * passes the remaining BYE into `West|2|1`, and the BYE `West|1|1` had advanced — dp 1 — comes out of `West|2|1`.
 *
 * The removal asked which side was cleared by the position being cleared (dp 2), which is not in `West|2|1` at all,
 * read no side, and dropped both sides' provenance — the produced DEFAULTED from a matchUp nobody touched with it. The
 * loser then arrived opposite nothing and waited in a `TO_BE_PLAYED` matchUp that could never be played.
 */

const DRAW_ID = 'withdrawn-bye-keeps-exit';

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
  const config = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 8, seed: 20030617, drawSize: 8 };
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
  const west = at('West|2|1');
  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  return {
    west: {
      participants: west.sides.map((side: any) => side.participantId ?? null),
      matchUpStatus: west.matchUpStatus,
      winningSide: west.winningSide,
    },
    stalls: stalls.length,
  };
}

const LEAD: [string, any][] = [
  ['East|1|4', { winningSide: 1 }],
  ['East|1|3', { winningSide: 2 }],
  ['East|2|2', { winningSide: 2 }],
];

it('census 20030617: the loser who passes the remaining BYE wins the produced exit waiting for them', () => {
  const corrected = play([
    ...LEAD,
    ['East|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['West|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
    ['East|1|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['East|1|2', { winningSide: 1 }],
    ['East|3|1', { winningSide: 1 }],
  ]);
  const direct = play([
    ...LEAD,
    ['West|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
    ['East|1|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['East|1|2', { winningSide: 1 }],
    ['East|3|1', { winningSide: 1 }],
  ]);

  expect(direct.west).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(corrected).toEqual(direct);
  expect(corrected.stalls).toEqual(0);
});
