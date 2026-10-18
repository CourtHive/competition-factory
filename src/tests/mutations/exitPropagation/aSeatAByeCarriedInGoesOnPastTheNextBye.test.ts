import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT A BYE CARRIED INTO A ROUND GOES ON PAST THE NEXT BYE (census A1 wave 3 G4, MODIFIED_FEED_IN_CHAMPIONSHIP 32/27
 * seed 21029862, the census schedule shrunk to three results and the probe).
 *
 * `Consolation|1|8` holds dp 23 opposite a BYE, so dp 23 stands in `Consolation|2|8` before anyone has played. `Main|1|2`'s
 * double walkover owes `Consolation|2|8` a BYE on its fed seat (dp 8), and a BYE advances the seat opposite it when it
 * lands, occupied or not: dp 23 goes on into `Consolation|3|4`. Entered with `Main|1|15`'s double walkover standing
 * first, the BYE `Main|1|15` owed dp 23's own seat met dp 8's BYE in `Consolation|2|8`, and the two sent one BYE on.
 * Clearing `Main|1|15` takes that BYE back, and the seat now opposite dp 8's BYE is owed its advance
 * (`theSeatLeftOppositeAByeGoesOn`). The settle pass refused it because dp 23 had entered `Consolation|2|8` from an
 * earlier round, which it reads as a reservation; a seat a BYE carried in is structural, as the BYE that carried it
 * was. Before this `Consolation|3|4` stood empty after the clear, and every entry order of the standing result puts
 * dp 23 there.
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

const CONFIG = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 27,
  drawSize: 32,
  seed: 21029862,
};
const SCHEDULE = [
  at('Main|1|15', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|15', CLEAR),
];
const STANDING = [at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER })];
const PROBE = at('Main|1|15', { winningSide: 2 });

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
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

it('the seat left opposite the BYE that stays goes on, as the standing result entered alone sends it', () => {
  const corrected = play(SCHEDULE, 'bye-carried-seat-corrected').find('Consolation|3|4').drawPositions ?? [];
  const standing = play(STANDING, 'bye-carried-seat-standing').find('Consolation|3|4').drawPositions ?? [];
  expect(standing.filter(Boolean)).toEqual([23]);
  expect(corrected.filter(Boolean)).toEqual([23]);
});

it('a result beside it and its clear return the draw as it was', () => {
  const drawId = 'bye-carried-seat-round-trip';
  const { enter } = play(SCHEDULE, drawId);
  const before = roundTrip(drawId);
  enter(PROBE);
  enter({ ...PROBE, outcome: CLEAR });
  expect(roundTrip(drawId)).toEqual(before);
});
