import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER PASSING INTO A BYE MATCHUP RECORDS ITS CARRY THERE (census A1 wave 3 G5, COMPASS 32/27 seed 21137946 under
 * `allowChangePropagation`, the census schedule shrunk to seven results and the probe).
 *
 * `East|1|3`'s default sends its loser into `West|1|2` and on, carrying the default, into `South|3|1`. `East|1|4`'s default
 * sends a second carrier into `West|1|2`: the two converge there, and the convergence's BYE takes the first carrier's
 * seat in `South|3|1`. `West|1|5`'s walkover carrier then waits in `South|2|2` for an opponent who never comes:
 * `East|1|14`'s double walkover puts a BYE on that seat, and the carrier goes through it into `South|3|1`, which the BYE
 * already holds. The carrier's walkover is written beside that BYE, as it is when the BYE in `South|2|2` stood there
 * first and the carrier then passed it ("a carry entry is written in each matchUp it is carried into past a BYE, in any
 * round and in either entry order"). When `East|1|4` is cleared the convergence dissolves, the BYE in `South|3|1` goes,
 * the default carrier comes back, and the two carries converge into a DOUBLE_WALKOVER. Before this the walkover was
 * never written in `South|3|1`, so the clear left the default standing alone and awarded the walkover carrier a match
 * they had walked over.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
// the round trip's projection without `matchUpStatusCodes` (index 4), whose writers disagree by design (census F1)
const roundTrip = (drawId: string) =>
  projectDraw(getDrawDefinition(drawId)).map((structure: any) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => row.filter((_: any, index: number) => index !== 4)),
  }));

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 21137946 };
const DEFAULTED_1 = { matchUpStatus: DEFAULTED, winningSide: 1 };
const SCHEDULE = [
  at('East|1|10', { winningSide: 2 }),
  at('East|1|3', DEFAULTED_1),
  at('East|1|9', { winningSide: 1 }),
  at('West|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|4', DEFAULTED_1),
  at('East|1|14', { matchUpStatus: DOUBLE_WALKOVER }),
];
const CORRECTION = at('East|1|4', CLEAR);
const PROBE = at('East|1|4', { matchUpStatus: DOUBLE_WALKOVER });

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  const enter = (step: Step) => {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
  };
  steps.forEach(enter);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  // provenance with each source named by its coordinate, so two draws can be compared
  const named = (key: string) => {
    const keys = new Map(getDrawMatchUps(drawId).map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
    const entries = Object.entries(find(key).sideExitProvenance ?? {});
    return Object.fromEntries(
      entries.map(([side, entry]: any) => [side, { ...entry, sourceMatchUpId: keys.get(entry.sourceMatchUpId) }]),
    );
  };
  return { enter, find, named };
}

it('the carrier passing the BYE in the final records its walkover beside it', () => {
  const { find } = play(SCHEDULE, 'carry-into-bye-final');
  const final = find('South|3|1');
  expect(final.matchUpStatus).toEqual('BYE');
  const carries = Object.values(final.sideExitProvenance ?? {}).filter(
    (entry: any) => entry.matchUpStatus === WALKOVER,
  );
  expect(carries.map((entry: any) => entry.sourceMatchUpId)).toEqual([find('West|1|5').matchUpId]);
});

it('when the BYE goes, the carrier who comes back converges with the carry recorded there', () => {
  const { enter, find } = play(SCHEDULE, 'carry-into-bye-final-cleared');
  enter(CORRECTION);
  const final = find('South|3|1');
  expect(final.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(final.winningSide).toBeUndefined();
});

it('a double walkover there and its clear return the draw as it was', () => {
  const drawId = 'carry-into-bye-final-round-trip';
  const { enter } = play([...SCHEDULE, CORRECTION], drawId);
  const before = roundTrip(drawId);
  enter(PROBE);
  enter({ ...PROBE, outcome: CLEAR });
  expect(roundTrip(drawId)).toEqual(before);
});
