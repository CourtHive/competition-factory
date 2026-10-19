import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

/**
 * A CARRIER'S ONWARD MATCHUP IS CHANGED ONLY AT THE CARRY'S ORIGIN, AND THIS IS WHY FIX B'S SKIP IS SAFE (census A1
 * wave 5; COMPASS 32/27 seed 21155795, the carrier of `aCarrierPastAByeIsReleasedWhenItsExitConverges`).
 *
 * `East|1|15`'s walkover sends its loser past `West|1|8`'s BYE into `West|2|4`, which their carried exit decides for the
 * empty seat. They go on as its loser into `Southwest|1|2`, past the BYE that `West|2|3` sends there, and into
 * `Southwest|2|1`. A participant arrives opposite them there by played results, and the carried walkover decides the
 * matchUp for that arrival.
 *
 * Nobody can then record a result of the carrier's in that onward matchUp: a played score, a director's DEFAULTED and a
 * director's WALKOVER are each refused `CANNOT_CHANGE_OUTCOME` (a carried exit is corrected at its origin), and the draw
 * is left as it was. This refusal is why, when the carrier's exit later converges, `releaseCarrier` in
 * `doubleExitAdvancement.ts` never meets an onward matchUp with a score or a direct exit: `carriedOnByExitsOnly`'s
 * negative branches and the clear-and-refuse path (`ERR_ACTIVE_DRAW_POSITION`) are unreachable, and the skip that
 * releases the carrier carry and all cannot take back anything a person recorded. See "A converging exit's carrier
 * leaves with the carry only where nothing was played" in `documentation/docs/concepts/exit-propagation.md`.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const CONFIG = { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21155795 };
const ONWARD = 'Southwest|2|1';
const SCHEDULE = [
  // the carrier, and the BYE `West|2|3` sends in front of them in `Southwest|1|2`
  { at: 'East|1|11', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  { at: 'East|1|15', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|10', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  { at: 'East|1|14', outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } },
  { at: 'East|1|9', outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
  // played results that send a participant through `Southwest|1|1` into the onward matchUp, opposite the carrier
  { at: 'East|1|2', outcome: { winningSide: 1 } },
  { at: 'East|1|3', outcome: { winningSide: 1 } },
  { at: 'East|1|4', outcome: { winningSide: 2 } },
  { at: 'East|1|6', outcome: { winningSide: 1 } },
  { at: 'East|1|8', outcome: { winningSide: 1 } },
  { at: 'West|1|2', outcome: { winningSide: 1 } },
  { at: 'West|2|1', outcome: { winningSide: 1 } },
  { at: 'West|2|2', outcome: { winningSide: 1 } },
  { at: 'Southwest|1|1', outcome: { winningSide: 1 } },
];

const find = (drawId: string, at: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === at);

function enter(drawId: string, at: string, outcome: any) {
  return observeMutation({
    propagateExitStatus: CONFIG.propagateExitStatus,
    matchUpId: find(drawId, at).matchUpId,
    outcome,
    drawId,
  });
}

/** the carrier stands past the BYE in the onward matchUp, which their carried walkover decided for the arrival */
function carrierPastTheBye(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const { at, outcome } of SCHEDULE) expect(enter(drawId, at, outcome).error).toBeUndefined();
  const carrier = find(drawId, 'West|2|4').sides[1].participantId;
  const onward = find(drawId, ONWARD);
  expect(find(drawId, 'Southwest|1|2')).toMatchObject({ matchUpStatus: 'BYE' });
  expect(onward.sides.map((side: any) => side.participantId)[1]).toEqual(carrier);
  expect(onward).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1 });
  expect(onward.sideExitProvenance?.[2]).toMatchObject({ matchUpStatus: 'WALKOVER' });
  return carrier;
}

/** the refusal, and a draw deep-equal to the one before the call */
function expectRefusedUnchanged(drawId: string, outcome: any) {
  const before = structuredClone(getDrawDefinition(drawId));
  const observed = enter(drawId, ONWARD, outcome);
  expect(observed.thrown).toBeUndefined();
  expect(observed.error?.code).toEqual('ERR_UNCHANGED_CANNOT_CHANGE_OUTCOME');
  expect(observed.mutated).toEqual(false);
  expect(getDrawDefinition(drawId)).toEqual(before);
  expect(find(drawId, ONWARD)).toMatchObject({ matchUpStatus: 'WALKOVER', winningSide: 1 });
}

it('a played score on the onward matchUp a carry decided is refused, and the draw is unchanged', () => {
  const drawId = 'aPlayedScoreOnACarrysOnwardMatchUpIsRefused';
  carrierPastTheBye(drawId);
  // the carrier "won on the court" opposite the arrival
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 2 });
  expectRefusedUnchanged(drawId, outcome);
});

it("a director's DEFAULTED of the carrier on the onward matchUp a carry decided is refused, and the draw is unchanged", () => {
  const drawId = 'aDirectDefaultOnACarrysOnwardMatchUpIsRefused';
  carrierPastTheBye(drawId);
  // the carrier's own default there
  expectRefusedUnchanged(drawId, { matchUpStatus: 'DEFAULTED', winningSide: 1 });
});

it("a director's WALKOVER on the onward matchUp a carry decided is refused, and the draw is unchanged", () => {
  const drawId = 'aDirectWalkoverOnACarrysOnwardMatchUpIsRefused';
  carrierPastTheBye(drawId);
  // the arrival's walkover, which would award the carrier the matchUp
  expectRefusedUnchanged(drawId, { matchUpStatus: 'WALKOVER', winningSide: 2 });
});
