import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A PARTICIPANT BROUGHT BACK PAST A WITHDRAWN BYE TAKES HOME ONLY THEIR OWN CARRY (census run 19, policy off:
 * OLYMPIC 32/29 20779675 and COMPASS 32/31 20865978, DRAW_INCONSISTENCY WINNER_NOT_ADVANCED; opened by #5444).
 *
 * A double exit makes a consolation seat a BYE, and the participant opposite it, who lost a PLAYED match, goes on past
 * it into a matchUp where another loser's carried walkover stands on the other side. When the double exit is cleared
 * the BYE is withdrawn and the participant comes home. The carry that comes home with a position is read on that
 * position's side, or, when the side cannot be read, from the one carried entry the matchUp holds. Their side held the
 * double exit's produced entry, so that fallback handed them the OTHER participant's carry, and the matchUp they came
 * home to read two exits. Until #5444 the stray copy stayed and that matchUp read DOUBLE_WALKOVER; since, the settle
 * withdraws it as a carry standing where its carrier is not, with what it decided, and the winner was never advanced.
 *
 * A side that records an entry of its own does not borrow the other side's carry. Each case is pinned by the census's
 * own `replay` and by the whole draw (status, winner and occupants of every matchUp) against the results entered
 * directly, without the double exit and its clear.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

const CASES = [
  {
    config: { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 29, drawSize: 32, seed: 20779675 },
    schedule: [
      at('East|1|10', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|11', { winningSide: 1 }),
      at('East|1|9', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|12', { winningSide: 1 }),
      at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('West|1|6', { winningSide: 2 }),
      at('East|1|9', CLEAR),
    ],
    // the participant who comes home, and the matchUp their win sends them on to
    home: 'South|1|3',
    onward: 'South|2|2',
  },
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 31, drawSize: 32, seed: 20865978 },
    schedule: [
      at('East|1|13', { winningSide: 2 }),
      at('East|1|9', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|11', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|14', { winningSide: 1 }),
      at('East|1|16', { matchUpStatus: DOUBLE_WALKOVER }),
      at('West|1|7', { winningSide: 1 }),
      at('East|1|16', { winningSide: 1 }),
    ],
    home: 'South|1|4',
    onward: 'South|2|2',
  },
];

/** each matchUp's last outcome, a cleared one dropped, entered once and in order: the results entered directly */
function directly(schedule: Step[]): Step[] {
  const net = new Map<string, Step>();
  for (const step of schedule) {
    net.delete(coordinate(step));
    if (step.outcome.matchUpStatus !== TO_BE_PLAYED) net.set(coordinate(step), step);
  }
  return [...net.values()];
}

function drawAfter(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
}

it.each(CASES)('$config.seed: the census replay holds every property', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `carry-home-${config.seed}`, POLICY_OFF)).toBeNull();
});

it.each(CASES)(
  '$config.seed: the winner of the matchUp they came home to goes on',
  ({ config, schedule, home, onward }) => {
    const draw = drawAfter(config, schedule, `carry-home-winner-${config.seed}`);
    const { winningSide, occupants } = draw[home];
    expect(winningSide).toBeDefined();
    expect(draw[onward].occupants).toContain(occupants[winningSide - 1]);
  },
);

it.each(CASES)('$config.seed: the draw is the one the results entered directly reach', ({ config, schedule }) => {
  expect(drawAfter(config, schedule, `carry-home-late-${config.seed}`)).toEqual(
    drawAfter(config, directly(schedule), `carry-home-direct-${config.seed}`),
  );
});
