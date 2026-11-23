import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY PAST A BYE COMES BACK WHEN A HOLDER TAKES THAT BYE BACK (census F2, FEED_IN_CHAMPIONSHIP_TO_SF, 2026-10-12).
 *
 * FEED_IN_CHAMPIONSHIP_TO_SF 16/16, `propagateExitStatus`, census seed 20501324 shrunk to seven steps. Jane defaults
 * `Main|1|3` and carries the default into the consolation; `Consolation|2|1`'s BYE position has been advanced into
 * `Consolation|3|1`, so she meets a BYE there and passes it (RULE 1) into `Consolation|4|1`, which is decided for its
 * empty fed seat by the default she carries. In the same call `settleHeldExits` sends `Consolation|2|1`'s held exit on:
 * that exit owns the seat its BYE stood in (the BYE stays; the exit travels), so `releaseHoldersByeFromTarget` takes the
 * BYE back out of `Consolation|3|1`, and the two exits meet there.
 *
 * Jane stayed in `Consolation|4|1`. The release rewrote the target's positions directly, so nothing brought back the
 * carry that had passed the BYE — `releaseAdvancedDrawPositionAcrossLinks` does that for any other BYE it vacates. When
 * `Main|1|2` was then corrected and `Consolation|3|1` re-derived to a winner, placing that winner in `4|1` was refused
 * (`ERR_EXISTING_POSITION_ASSIGNMENT`) after the draw had been written.
 *
 * Falsified: without the release of what passed the BYE, or without the release of a matchUp decided only by the
 * leaving carry for an unoccupied seat, Jane stays in `4|1` and the correction is refused; both fail on `dev`.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  propagateExitStatus: true,
  participantsCount: 16,
  seed: 20501324,
  drawSize: 16,
};
type Step = [string, any];

const SETUP: Step[] = [
  ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|8', { matchUpStatus: DOUBLE_WALKOVER }],
];
const CORRECTION: Step = ['Main|1|2', { winningSide: 1 }];

const at = (drawId: string, coordinates: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);

function apply(drawId: string, [coordinates, outcome]: Step) {
  const target = at(drawId, coordinates);
  expect(target, coordinates).toBeDefined();
  const before = JSON.stringify(getDrawDefinition(drawId));
  const result = tournamentEngine.setMatchUpStatus({
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    outcome,
    drawId,
  });
  return { error: result.error, mutated: JSON.stringify(getDrawDefinition(drawId)) !== before };
}

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of steps) expect(apply(drawId, step).error, step[0]).toBeUndefined();
}

it('the carrier comes back from Consolation|4|1 when the BYE she passed is taken back', () => {
  play('released', SETUP);
  const semifinal = at('released', 'Consolation|3|1');
  const final = at('released', 'Consolation|4|1');
  const jane = semifinal.sides?.find((side: any) => side.participant)?.participant?.participantId;
  expect(jane).toBeDefined();
  expect(final.sides?.some((side: any) => side.participantId === jane)).toEqual(false);
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition('released') }).inconsistencies ?? []).toEqual([]);
});

it('the correction that re-derives Consolation|3|1 is accepted and seats its winner', () => {
  play('corrected', SETUP);
  const corrected = apply('corrected', CORRECTION);
  expect(corrected.error).toBeUndefined();
  const final = at('corrected', 'Consolation|4|1');
  const semifinal = at('corrected', 'Consolation|3|1');
  const winner = semifinal.sides?.find((side: any) => side.sideNumber === semifinal.winningSide)?.participantId;
  expect(winner).toBeDefined();
  expect(final.sides?.some((side: any) => side.participantId === winner)).toEqual(true);
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition('corrected') }).inconsistencies ?? []).toEqual([]);
});
