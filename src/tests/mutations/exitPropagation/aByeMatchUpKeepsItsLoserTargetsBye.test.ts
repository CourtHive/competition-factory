import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A BYE MATCHUP KEEPS ITS LOSER TARGET'S BYE — census 20053188 and 20000380 (OLYMPIC 8/8, `allowChangePropagation`).
 *
 * `East|1|1` and `East|1|2` are walkovers, so both of their losers reach `West|1|1` carrying an exit: it converges to a
 * DOUBLE_WALKOVER, which claims a BYE in `South|1|1`, the seat its loser would have taken. Then `East|1|2` is corrected
 * to a DOUBLE_DEFAULT. Its loser leaves `West|1|1`, that seat becomes a BYE, and `West|1|1` re-derives from a double
 * exit to a BYE matchUp — whose loser target is owed a BYE for a different reason: it will never produce a loser.
 *
 * The cascade placing that BYE found the seat already a BYE and did nothing; `settleRederivedDoubleExit` then withdrew
 * the double exit's claim and, the claim being the last, cleared the seat. `South|1|1`'s other participant waited for
 * an opponent who could never come. Forward play — the same results entered directly — leaves the BYE there.
 */

const DRAW_ID = 'bye-matchup-keeps-loser-target-bye';

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
  const config = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 8, seed: 20053188, drawSize: 8 };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const project = (key: string) => {
    const matchUp = at(key);
    return {
      sides: matchUp.sides.map((side: any) => (side.bye ? BYE : (side.participantId ?? null))),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
    };
  };
  return { west: project('West|1|1'), south: project('South|1|1') };
}

const stalls = () =>
  (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  ).length;

it('a double exit corrected into a BYE matchUp leaves its loser target the BYE forward play gives it', () => {
  const direct = play([
    ['East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);
  const corrected = play([
    ['East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ]);
  // the convergence the correction starts from, and the BYE it claimed
  expect(corrected.west.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(corrected.south.sides).toContain(BYE);

  const after = play([
    ['East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['East|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);

  expect(direct.west.matchUpStatus).toEqual(BYE);
  expect(direct.south.sides).toContain(BYE);
  expect(after).toEqual(direct);
});

it('census 20053188: the full schedule ends with no stall', () => {
  play([
    ['East|1|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['East|1|3', { winningSide: 1 }],
    ['East|1|4', { winningSide: 1 }],
    ['West|1|2', { winningSide: 1 }],
    ['East|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
    ['East|3|1', { winningSide: 2 }],
  ]);
  expect(at('South|1|1').matchUpStatus).toEqual(BYE);
  expect(stalls()).toEqual(0);
});
