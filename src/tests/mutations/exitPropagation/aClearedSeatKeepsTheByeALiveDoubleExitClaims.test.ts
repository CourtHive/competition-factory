import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
  projectDraw,
  normalize,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CLEARED SEAT KEEPS THE BYE A LIVE DOUBLE EXIT STILL CLAIMS (`positionClear`, `aLiveClaimHoldsTheBye`; built by
 * hand, COMPASS 16/16, `doubleExitPropagateBye` at its default).
 *
 * `West|1|3`'s double walkover produces a walkover into `West|2|2`, and the loser of `West|2|2` is nobody: whoever
 * arrives beside the walkover wins it. So `Southwest|1|1` drawPosition 2, the seat that loser feeds, is the BYE nobody
 * can fill, and the BYE stands on `West|1|3`'s account (its claim is recorded there). `East|1|7` and the probe,
 * `East|1|8`, are double walkovers too, and their BYEs meet in `West|1|4` and go on as one into `West|2|2`. Clearing
 * the probe withdraws its BYE, the BYE it sent on comes back out of `West|2|2`, and the removal took back what
 * `West|2|2` had sent over its loser link, BYE and all, though `West|1|3` still stands a double walkover and still owes
 * it. `Southwest|1|1` was left TO_BE_PLAYED, waiting on an opponent who can never arrive, with a claim recorded on a
 * BYE that was gone. The BYE survives while another live claim names it, the rule `removeDoubleExit` keeps at its own
 * loser target (`byeClaimSurvives`).
 *
 * `reDerivedLoserStands` does not cover it: `West|2|2` re-derives to a pending walkover, undecided, so there is no
 * re-derived result to serve the link from. Only the claim says the BYE has a reason to exist.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
const occupants = (matchUp: any) =>
  (matchUp?.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined));

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 1 };
const SCHEDULE: Step[] = [
  at('East|1|5', { winningSide: 1 }),
  at('East|1|6', { winningSide: 1 }),
  at('West|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
];
const PROBE = at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER });

/** the schedule, then the probe and its clear */
function roundTrip(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of SCHEDULE) {
    const target = find(getDrawMatchUps(drawId), coordinate(step));
    const result = observeMutation({ ...mutation(target, step.outcome), drawId });
    expect(result.error).toBeUndefined();
  }
  const scheduled = getDrawMatchUps(drawId);
  const before = normalize(projectDraw(getDrawDefinition(drawId)));
  const probe = find(scheduled, coordinate(PROBE));
  const forward = observeMutation({ ...mutation(probe, PROBE.outcome), drawId });
  expect(forward.error).toBeUndefined();
  const probed = getDrawMatchUps(drawId);
  const cleared = observeMutation({ ...mutation(probe, clearOutcome), drawId });
  expect(cleared.error).toBeUndefined();
  const after = getDrawMatchUps(drawId);
  const restored = normalize(projectDraw(getDrawDefinition(drawId)));
  return { scheduled, probed, after, before, restored };
}
const mutation = (matchUp: any, outcome: any) => ({
  propagateExitStatus: CONFIG.propagateExitStatus,
  matchUpId: matchUp.matchUpId,
  outcome,
});

it('the probe and its clear leave the scheduled draw', () => {
  const { before, restored } = roundTrip('live-claim-round-trip');
  expect(restored).toEqual(before);
});

it("the probe's BYE goes on into West|2|2, beside West|1|3's produced walkover", () => {
  const { scheduled, probed } = roundTrip('live-claim-probed');
  const claimant = find(scheduled, 'West|1|3').matchUpId;
  expect(find(probed, 'West|1|4').matchUpStatus).toEqual(BYE);
  expect(find(probed, 'West|2|2').matchUpStatus).toEqual(BYE);
  expect(find(probed, 'West|2|2').sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(claimant);
  expect(find(probed, 'Southwest|1|1').sideExitProvenance?.[2]?.byeClaims).toEqual([claimant]);
});

it("the BYE at West|2|2's loser seat stands on West|1|3's claim once the probe is cleared", () => {
  const { scheduled, after } = roundTrip('live-claim-seat');
  const claimant = find(scheduled, 'West|1|3').matchUpId;
  expect(find(after, 'West|1|3').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find(after, 'West|2|2').matchUpStatus).toEqual(WALKOVER);
  expect(find(after, 'West|2|2').winningSide).toBeUndefined();
  expect(occupants(find(after, 'Southwest|1|1'))).toEqual([undefined, 'BYE']);
  expect(find(after, 'Southwest|1|1').matchUpStatus).toEqual(BYE);
  expect(find(after, 'Southwest|1|1').sideExitProvenance?.[2]?.byeClaims).toEqual([claimant]);
});
