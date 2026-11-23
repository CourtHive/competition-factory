import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT CARRIED PAST A LATE BYE IS WRITTEN — forward play, MODIFIED_FEED_IN_CHAMPIONSHIP 8/8 (census 20037222's draw).
 *
 * CA, 2026-10-02: *"a propagated exit encountering a BYE should be advanced. In both cases the BYE remains a BYE."*
 *
 * `Main|1|4`'s loser walked over and reaches `Consolation|1|2` carrying that exit. When the BYE is ALREADY in the other
 * seat, `progressExitStatus` carries her past it (RULE 1) and writes the walkover where she lands (RULE 2): whoever
 * arrives there wins it. When the BYE comes LATER — `Main|1|3` a double walkover entered after her — the BYE cascade
 * moved her on and wrote nothing: `Consolation|2|2` held her as an ordinary participant, and `Main|2|1`'s loser arrived
 * to a match to be played against somebody who had withdrawn.
 *
 * The order the two results are entered in must not decide whether her exit counts.
 */

const DRAW_ID = 'an-exit-carried-past-a-late-bye';

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

/** a matchUp as the assertions read it */
const view = (key: string) => {
  const matchUp = at(key);
  return {
    participants: matchUp.sides.map((side: any) => side.participantId ?? null),
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
  };
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 20037222,
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
  const project = view;
  return { fed: project('Consolation|2|2'), onward: project('Consolation|3|1') };
}

const LEAD: [string, any][] = [
  ['Main|1|1', { matchUpStatus: RETIRED, winningSide: 1 }],
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
];
const EXIT: [string, any] = ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }];
const BYE_SOURCE: [string, any] = ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }];
const ARRIVAL: [string, any] = ['Main|2|1', { winningSide: 1 }];

it('the BYE first: the carried exit is written where she lands', () => {
  const byeFirst = play([...LEAD, BYE_SOURCE, EXIT, ARRIVAL]);
  expect(byeFirst.fed).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
});

it('the BYE later: the same', () => {
  const byeFirst = play([...LEAD, BYE_SOURCE, EXIT, ARRIVAL]);
  const byeLater = play([...LEAD, EXIT, BYE_SOURCE, ARRIVAL]);
  expect(byeLater).toEqual(byeFirst);
});

it('the BYE later and the opponent already there: the walkover is theirs, and they go on', () => {
  const byeFirst = play([...LEAD, BYE_SOURCE, EXIT, ARRIVAL]);
  const opponentFirst = play([...LEAD, EXIT, ARRIVAL, BYE_SOURCE]);
  expect(opponentFirst).toEqual(byeFirst);
  expect(opponentFirst.onward.participants).toContain(opponentFirst.fed.participants[0]);
});

/**
 * Census 20030075 (FEED_IN_CHAMPIONSHIP 8/5): the BYE a double default claims, met before or after the carrier, sends
 * the carry to the same place. The BYE-held matchUp keeps the carrier's entry when the BYE comes late, as it does
 * wherever a carrier passes a BYE (`stampCarriedExitOnArrival` reads it); the relabel that withdraws the carry clears it
 * there too (`aRelabelWithdrawsACarryFromAByeHeldMatchUp`).
 */
it('census 20030075: the carry lands in the same place in either order', () => {
  const state = view;
  const run = (steps: [string, any][]) => {
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
    return { byeHeld: state('Consolation|2|2'), onward: state('Consolation|3|1') };
  };
  const exit: [string, any] = ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }];
  const claim: [string, any] = ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }];

  const byeFirst = run([claim, exit]);
  expect(byeFirst.onward).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
  expect(run([exit, claim])).toEqual(byeFirst);
});
