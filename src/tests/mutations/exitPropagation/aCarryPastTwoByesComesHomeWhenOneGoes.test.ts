import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY PAST TWO BYES COMES HOME WHEN ONE OF THEM GOES (P53), census de 9300487 shrunk to four steps.
 *
 * DOUBLE_ELIMINATION 16/13, `propagateExitStatus`. `Main|1|6`'s double walkover puts a BYE in `Backdraw|1|2`, and
 * `Main|1|4`'s puts one in `Backdraw|2|2`. Hedges defaults out of `Main|1|5`: he passes both BYEs, and his default is
 * written where he lands, `Backdraw|3|1`, pending over the empty seat (RULE 2). Then `Main|1|6` is re-scored as played:
 * its loser, Wormwood, takes the seat the BYE held, and Hedges goes back to `Backdraw|1|2`.
 *
 * Before the change his default stayed at `Backdraw|3|1`: decided, over two empty seats, against whoever arrived
 * (on `dev`, the full census schedule had it decide `3|1` against Ahern, who never defaulted); and `1|2` was an
 * ordinary match. P50 brought a carry home on the REMOVAL path; this was the RELEASE path, which takes a carrier back
 * out of the rounds a withdrawn BYE had moved them through. Forward play, the double walkover never entered, is the
 * reference: the default meets Wormwood at `1|2`, who wins it and goes on past the BYE at `2|2`.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 13,
  seed: 9300487,
  drawSize: 16,
};
type Step = [string, any];

function play(drawId: string, steps: Step[], allowChangePropagation: boolean) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    const result: any = tournamentEngine.setMatchUpStatus({
      ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error, coordinates).toBeUndefined();
  }
  const matchUps = getDrawMatchUps(drawId);
  const backdraw = Object.fromEntries(
    matchUps
      .filter((matchUp: any) => matchUp.structureName === 'Backdraw')
      .map((matchUp: any) => [
        key(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          sides: (matchUp.sides ?? []).map((side: any) => side.participantId ?? (side.bye ? 'BYE' : undefined)),
        },
      ]),
  );
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  return { at, backdraw, integrity };
}

const HEDGES_DEFAULTS: Step = ['Main|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }];
const BYE_AT_2_2: Step = ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }];

describe.each([false, true])('allowChangePropagation %s', (allowChangePropagation) => {
  it('the default comes back to Backdraw|1|2 with Hedges, as forward play has it', () => {
    const corrected = play(
      `two-byes-corrected-${allowChangePropagation}`,
      [['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }], BYE_AT_2_2, HEDGES_DEFAULTS, ['Main|1|6', { winningSide: 1 }]],
      allowChangePropagation,
    );
    expect(corrected.integrity.valid).toEqual(true);
    expect(corrected.at('Backdraw|1|2').matchUpStatus).toEqual(DEFAULTED);
    expect(corrected.at('Backdraw|3|1').matchUpStatus).toEqual(TO_BE_PLAYED);
    const correctedBackdraw = corrected.backdraw;

    // each play builds its own tournament, so the corrected state was read before this replaces it
    const forward = play(
      `two-byes-forward-${allowChangePropagation}`,
      [['Main|1|6', { winningSide: 1 }], BYE_AT_2_2, HEDGES_DEFAULTS],
      allowChangePropagation,
    );
    expect(correctedBackdraw).toEqual(forward.backdraw);
  });
});
