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
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * A PASSER COMES BACK WHEN THE HOLDER'S BYE GOES (census A1 wave 3 R11b, FEED_IN_CHAMPIONSHIP_TO_SF 16/14 seed 21089693
 * under `allowChangePropagation`, the census schedule shrunk to seven results and the probe).
 *
 * `Main|2|4`'s default carrier stands in `Consolation|3|1`, the default awarded to the seat opposite (dp 4), which
 * `Consolation|2|2`'s produced walkover has reserved and nobody holds. `Main|1|6`'s double walkover makes `Main|2|3` a
 * walkover whose loser is nobody, so its fed seat in `Consolation|2|2` (dp 4) is a BYE: `Consolation|2|2` is now a BYE
 * holder, a BYE with a pending exit on record. The BYE lands where dp 4 stands furthest on, `Consolation|3|1`, and the
 * carrier passes it into `Consolation|4|1`, where their default decides the matchUp for the participant waiting there,
 * who goes on. Settling then sends the holder's walkover on: the holder's BYE is taken back out of `Consolation|3|1`
 * (the BYE stays, the exit travels), the walkover meets the carrier's default there, and the convergence produces a
 * walkover into `Consolation|4|1` for the same seat. The carrier had passed a BYE that is no longer there, so they come
 * back with it, although the seat opposite them in `Consolation|4|1` is held: its occupant went on from it and stays, as
 * the produced walkover awards them the same seat. Before this the carrier stayed in `Consolation|4|1` beside the
 * produced walkover, which then read as an undecided walkover holding two participants; the census row's standing
 * results, entered in seven orders of eight, read as the draw does now.
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
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  propagateExitStatus: true,
  participantsCount: 14,
  drawSize: 16,
  seed: 21089693,
};
const DEFAULTED_1 = { matchUpStatus: DEFAULTED, winningSide: 1 };
const SCHEDULE = [
  at('Main|1|4', DEFAULTED_1),
  at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|7', { winningSide: 2 }),
  at('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|2', { winningSide: 2 }),
  at('Main|3|1', { winningSide: 2 }),
  at('Main|2|4', DEFAULTED_1),
];
const PROBE = at('Main|1|6', { matchUpStatus: DOUBLE_WALKOVER });

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

it('the carrier comes back to the convergence, and the produced walkover awards the seat held opposite', () => {
  const { enter, find } = play(SCHEDULE, 'passer-comes-back');
  const occupant = find('Consolation|4|1').sides.find((side: any) => side.participantId).participantId;
  enter(PROBE);
  const converged = find('Consolation|3|1');
  expect(converged.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  const target = find('Consolation|4|1');
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(target.sides.map((side: any) => side.participantId).filter(Boolean)).toEqual([occupant]);
  expect(target.sides.find((side: any) => side.sideNumber === target.winningSide)?.participantId).toEqual(occupant);
  const carries = Object.values(target.sideExitProvenance ?? {}).map((entry: any) => entry.sourceMatchUpId);
  expect(carries).toEqual([converged.matchUpId]);
  expect(find('Consolation|5|1').sides.some((side: any) => side.participantId === occupant)).toEqual(true);
});

it('the double walkover entered with the other results, round by round, reaches the same matchUps', () => {
  const probed = play([...SCHEDULE, PROBE], 'passer-forward');
  const forward = ['Consolation|3|1', 'Consolation|4|1'].map((key) => [
    probed.find(key).matchUpStatus,
    (probed.find(key).drawPositions ?? []).filter(Boolean),
  ]);
  const byRound = [...SCHEDULE, PROBE].toSorted(
    (a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition,
  );
  const reversed = play(byRound, 'passer-by-round');
  const reverse = ['Consolation|3|1', 'Consolation|4|1'].map((key) => [
    reversed.find(key).matchUpStatus,
    (reversed.find(key).drawPositions ?? []).filter(Boolean),
  ]);
  expect(reverse).toEqual(forward);
});

it('the double walkover and its clear return the draw as it was', () => {
  const drawId = 'passer-round-trip';
  const { enter } = play(SCHEDULE, drawId);
  const before = roundTrip(drawId);
  enter(PROBE);
  enter({ ...PROBE, outcome: CLEAR });
  expect(roundTrip(drawId)).toEqual(before);
});
