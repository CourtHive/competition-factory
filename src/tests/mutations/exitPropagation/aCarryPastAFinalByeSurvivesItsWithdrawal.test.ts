import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY PAST A BYE IN A STRUCTURE'S LAST ROUND SURVIVES THE BYE'S WITHDRAWAL (P51).
 *
 * The ninth at-scale run's only stall, census seed 20318646 (COMPASS 8/8, `propagateExitStatus`, every arm), shrunk to
 * nine steps. Zoe defaults out of `East|1|3` and carries it into `West|1|2`, then on as its loser into `South|1|1` —
 * the South FINAL — where a BYE already stands (placed by `East|1|1`'s double walkover). RULE 1 carries an exit past a
 * BYE to wherever the carrier lands, but a final has nowhere further, and nothing was written. When `East|1|1` was
 * re-scored the BYE went, and Zoe stood in `South|1|1` as an ordinary participant: it was played, which made
 * `West|1|2`'s downstream active, so the double walkover `East|1|4`'s walkover brought there was refused AFTER the
 * direction had written, its winner never advanced, and `West|2|1` stalled.
 *
 * The carry is now recorded beside the BYE, so its withdrawal re-derives `South|1|1` to the default Zoe holds — the
 * same state the other order reaches (Zoe seated first, the BYE arriving after), which already kept it. Falsified
 * before the change: `South|1|1` TO_BE_PLAYED with no entry; the seed refused `East|1|4` after mutating and stalled.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 8, seed: 20318646, drawSize: 8 };

function play(drawId: string, steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  const refusedAfterMutating: string[] = [];
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const before = JSON.stringify(getDrawDefinition(drawId));
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    if (result.error && JSON.stringify(getDrawDefinition(drawId)) !== before) refusedAfterMutating.push(coordinates);
  }
  const matchUps = getDrawMatchUps(drawId);
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const winnerName = (matchUp: any) =>
    matchUp.sides.find((side: any) => side.sideNumber === matchUp.winningSide)?.participant?.participantName;
  return { at, winnerName, refusedAfterMutating };
}

describe('a carry past a BYE in a structure final survives the BYE', () => {
  const zoeCarriesIntoSouth: [string, any][] = [
    ['East|1|2', { winningSide: 2 }],
    ['East|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ];

  it.each([
    ['the BYE stands first', [['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }], ...zoeCarriesIntoSouth]],
    ['Zoe is seated first', [...zoeCarriesIntoSouth, ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }]]],
  ])('%s: withdrawing the BYE leaves South|1|1 DEFAULTED by the exit Zoe carries', (_, steps: any) => {
    const { at } = play(`final-bye-${steps[0][0]}`, [...steps, ['East|1|1', { winningSide: 1 }]]);
    const south = at('South|1|1');
    expect(south.matchUpStatus).toEqual(DEFAULTED);
    const zoe = south.sides.find((side: any) => side.participant?.participantName === 'Zoe Runciter');
    expect(zoe).toBeDefined();
    // the side without the exit wins, still empty: West|1|1's loser takes it on arrival
    expect(south.winningSide).toEqual(3 - zoe.sideNumber);
    expect(south.sideExitProvenance[zoe.sideNumber].matchUpStatus).toEqual(DEFAULTED);
  });

  it('census 20318646: the walkover that meets the default converges, and nothing is stranded', () => {
    const { at, winnerName, refusedAfterMutating } = play('final-bye-census', [
      ['East|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
      ...zoeCarriesIntoSouth,
      ['East|1|1', { winningSide: 1 }],
      ['West|1|1', { winningSide: 2 }],
      // South|1|1 is decided by the carried default: a played result there is refused, and writes nothing
      ['South|1|1', { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }],
      ['East|2|1', { winningSide: 1 }],
      ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['East|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ]);
    expect(refusedAfterMutating).toEqual([]);
    expect(at('West|1|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
    const final = at('West|2|1');
    expect(final.matchUpStatus).toEqual(WALKOVER);
    expect(winnerName(final)).toEqual('Nicole Swift');

    const drawDefinition = getDrawDefinition('final-bye-census');
    const integrity: any = getDrawInconsistencies({ drawDefinition, drawId: 'final-bye-census' });
    expect(integrity.inconsistencies ?? []).toEqual([]);
    expect(integrity.valid).toEqual(true);
  });
});
