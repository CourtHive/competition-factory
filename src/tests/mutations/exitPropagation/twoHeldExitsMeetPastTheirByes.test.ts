import { getDrawDefinition, getDrawMatchUps, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { reconcileStaleExitOrigins } from '@Mutate/matchUps/matchUpStatus/reconcileStaleExitOrigins';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * TWO HELD EXITS MEET PAST THEIR OWN BYES (P54; census F2 SETTLE-B, 2026-10-11).
 *
 * FIRST_MATCH_LOSER_CONSOLATION 16/14 under `doubleExitPropagateBye: false`, census seed 20515211 shrunk to five steps.
 * `Consolation|1|2`'s double walkover produces a walkover that waits at `Consolation|2|2`; `Main|1|2`'s double default
 * produces a default that passes `Consolation|1|1`'s BYE and waits at `Consolation|2|1`. When `Main|2|2` is decided its
 * loser is not eligible for the feed, so a BYE fills `Consolation|2|2`'s fed seat: both feeders of `Consolation|3|1` are
 * now holders — a BYE with nobody in it and an exit on record — and the two exits meet there (RULE 4), producing onward
 * into `Consolation|4|1` (`twoHeldExitsMeet`, the FEED_IN_CHAMPIONSHIP shape).
 *
 * They did not. `Consolation|2|2`'s own BYE position already stood in `3|1`, so the first exit read it as a BYE and
 * passed straight through into `4|1`, taking its seat with it; and with that BYE released, the second exit's side had
 * been read from the seat it no longer held, so it arrived on the first's side and was not seen to meet it. The draw
 * stood unconverged until a later call's reconciliation withdrew the relay.
 *
 * Falsified, one change at a time: reading the other holder's BYE as a BYE carries the default on into `4|1`; reading
 * the arrival side before the release leaves `3|1` a single DEFAULTED. Each fails the first claim, as `dev` before the
 * change does. The order claim holds on `dev` too — both orders reached the same unconverged draw — and is kept so that
 * the convergence cannot become order-dependent.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: false,
  participantsCount: 14,
  seed: 20515211,
  drawSize: 16,
};
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
type Step = [string, any];

const SETUP: Step[] = [
  ['Main|1|4', { winningSide: 2 }],
  ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Consolation|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
];
const DOUBLE_DEFAULT_AT_MAIN_1_2: Step = ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }];
const MAIN_2_2_DECIDED: Step = ['Main|2|2', { winningSide: 1 }];

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome, drawId });
    expect(result.error, coordinates).toBeUndefined();
  }
}

const at = (drawId: string, coordinates: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);

const view = (drawId: string) =>
  Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      key(matchUp),
      [
        matchUp.matchUpStatus,
        matchUp.winningSide,
        (matchUp.drawPositions ?? []).filter(Boolean),
        (matchUp.sides ?? []).map((side: any) => (side.bye ? 'BYE' : side.participant?.participantName)),
      ],
    ]),
  );

/** would the reconciliation, asked of the draw as it stands, change anything? Asked of a copy */
function hasStaleOrigin(drawId: string) {
  const copy = structuredClone(getDrawDefinition(drawId));
  const before = hash(copy);
  reconcileStaleExitOrigins({ drawDefinition: copy });
  return hash(copy) !== before;
}

it('the default and the walkover meet in Consolation|3|1 and produce onward', () => {
  play('meet', [...SETUP, DOUBLE_DEFAULT_AT_MAIN_1_2, MAIN_2_2_DECIDED]);

  const semifinal = at('meet', 'Consolation|3|1');
  expect(semifinal.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(Object.keys(semifinal.sideExitProvenance ?? {}).sort((a, b) => a.localeCompare(b))).toEqual(['1', '2']);

  // the produced walkover waits in the final with no seat of its own: nobody went on from the convergence
  const final = at('meet', 'Consolation|4|1');
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.winningSide).toBeUndefined();
  expect((final.drawPositions ?? []).filter(Boolean)).toEqual([]);

  expect(hasStaleOrigin('meet')).toEqual(false);
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition('meet') }).inconsistencies ?? []).toEqual([]);
});

it('is the draw the other order leaves', () => {
  play('default-last', [...SETUP, DOUBLE_DEFAULT_AT_MAIN_1_2, MAIN_2_2_DECIDED]);
  // read before the next draw is prepared: each `prepareDraw` replaces the tournament
  const defaultFirst = view('default-last');

  play('bye-first', [...SETUP, MAIN_2_2_DECIDED, DOUBLE_DEFAULT_AT_MAIN_1_2]);
  expect(defaultFirst).toEqual(view('bye-first'));
});
