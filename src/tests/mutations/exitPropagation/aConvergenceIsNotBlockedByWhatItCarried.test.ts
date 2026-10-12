import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE IS NOT BLOCKED BY WHAT ITS OWN CARRIED EXITS DECIDED (CA, 2026-10-11; census F2, P51's group 1).
 *
 * COMPASS 16, census seed 20469892 shrunk to five steps. Cimorene walks over `East|1|3` and carries the walkover into
 * `West|1|2`, which is decided for the seat still awaiting `East|1|4`'s loser; she goes on as its loser, carrying it
 * into `South|1|1` (Matilda wins it) and on into `Southeast|1|1`. Jerry then walks over `East|1|4` and carries his
 * walkover into `West|1|2`: two exits meet (RULE 4) and it becomes a DOUBLE_WALKOVER.
 *
 * It was refused, `INCOMPATIBLE_MATCHUP_STATUS`, after the direction had written: `South|1|1` read as ACTIVE
 * downstream because Cimorene had carried the walkover one hop further, although nobody had played anything below
 * `West|1|2`. CA's rule of 2026-09-25 — only GENUINELY active downstream blocks, never ADVANCED active — now governs
 * the cascade's convergence too. 24 of the 25 P51 instances in the thirteenth and fourteenth runs were this shape.
 *
 * The oracle is order: recorded the other way round, the same two walkovers leave the same draw. Falsified on `dev`
 * before the change: the convergence is refused, and the draw differs from the other order.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, seed: 20469892, drawSize: 16 };
type Step = [string, any];

const PLAYED: Step[] = [
  ['East|1|1', { winningSide: 2 }],
  ['East|1|2', { winningSide: 1 }],
  ['West|1|1', { winningSide: 1 }],
];
const CIMORENE: Step = ['East|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }];
const JERRY: Step = ['East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }];

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  return steps.map(([coordinates, outcome]) => {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const before = JSON.stringify(getDrawDefinition(drawId));
    const result = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    return { error: result.error?.code, mutated: JSON.stringify(getDrawDefinition(drawId)) !== before };
  });
}

const view = (drawId: string) =>
  Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      key(matchUp),
      [
        matchUp.matchUpStatus,
        matchUp.winningSide,
        (matchUp.sides ?? []).map((side: any) => (side.bye ? 'BYE' : side.participant?.participantName)),
      ],
    ]),
  );

it('the second walkover converges, and the draw is the one the other order leaves', () => {
  const results = play('cimorene-first', [...PLAYED, CIMORENE, JERRY]);
  expect(results.map((result) => result.error)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  const converged = view('cimorene-first');
  expect(converged['West|1|2']).toEqual([DOUBLE_WALKOVER, undefined, ['Cimorene Fuller', 'Jerry Mander']]);
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition('cimorene-first') }).inconsistencies ?? []).toEqual(
    [],
  );

  // read before the next draw is prepared: each `prepareDraw` replaces the tournament
  play('jerry-first', [...PLAYED, JERRY, CIMORENE]);
  expect(converged).toEqual(view('jerry-first'));
});
