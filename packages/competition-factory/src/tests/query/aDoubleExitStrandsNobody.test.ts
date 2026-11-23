import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DOUBLE EXIT STRANDS NOBODY — census 9700004 (COMPASS 8/7), the early-exit arm (`exitBeforeArrivalCensus`).
 *
 * `STALLED_POSITION` reports a participant left alone in a matchUp whose opponent can never arrive. It already exempts
 * a lone occupant whose own side carries an exit — somebody who walked over is not somebody waiting — but it read that
 * from provenance, and a DIRECTLY recorded exit leaves none. Here Ellul reaches the West final alone and a DEFAULTED is
 * recorded against him there (the empty side is awarded); then `West|1|2`'s double exit produces a WALKOVER into that
 * empty side and the two converge into a DOUBLE_WALKOVER. Both sides have exited, the final is complete, nobody waits —
 * and the detector flagged Ellul, because the convergence rewrote the status and his direct exit was nowhere on record.
 *
 * A double exit has, by its name, exited on both sides: it strands nobody, whatever the provenance says. Measured on the
 * pre-fix `dev` (5ee57576ea) over every stall the 2026-10 campaign fixed: 69 of 69 were `TO_BE_PLAYED` with one
 * occupant; none was a double exit, so this exemption hides none of them.
 */

const DRAW_ID = 'a-double-exit-strands-nobody';

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

it('a lone occupant inside a double exit is not a stalled position', () => {
  setSubscriptions({});
  const config = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 7, seed: 9700004, drawSize: 8 };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  const steps: [string, any][] = [
    ['East|1|3', { matchUpStatus: DEFAULTED, winningSide: 2 }],
    ['East|1|2', { winningSide: 1 }],
    // Ellul alone in the West final: a DEFAULTED recorded against him, the empty side awarded
    ['West|2|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
    // West|1|2 becomes a double exit and produces a WALKOVER into that empty side: the two converge
    ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|2|1', { winningSide: 1 }],
    ['East|2|2', { matchUpStatus: DEFAULTED, winningSide: 2 }],
    ['East|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ];
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }

  const final = at('West|2|1');
  expect(final.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(final.winningSide).toBeUndefined();
  expect((final.sides ?? []).filter((side: any) => side.participantId).length).toEqual(1);

  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  expect(inconsistencies.filter((i: any) => i.issueType === STALLED_POSITION)).toEqual([]);
});
