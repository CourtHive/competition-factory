import { byeSeatsOwedTo, feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { positionTargets } from '@Query/matchUp/positionTargets';
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
 * can fill, and the BYE stands on `West|1|3`'s account. `East|1|7` and the probe, `East|1|8`, are double walkovers too,
 * and their BYEs meet in `West|1|4` and go on as one into `West|2|2`. Clearing the probe withdraws its BYE, the BYE it
 * sent on comes back out of `West|2|2`, and the removal took back what `West|2|2` had sent over its loser link, BYE and
 * all, though `West|1|3` still stands a double walkover and still owes it. `Southwest|1|1` was left TO_BE_PLAYED,
 * waiting on an opponent who can never arrive, with a claim recorded on a BYE that was gone. The fix kept the BYE while
 * another live claim named it, the rule `removeDoubleExit` kept at its own loser target (`byeClaimSurvives`).
 *
 * `reDerivedLoserStands` does not cover it: `West|2|2` re-derives to a pending walkover, undecided, so there is no
 * re-derived result to serve the link from. Only the claim said the BYE had a reason to exist.
 *
 * The `byeClaims` ledger is retired (Mentat P58, CA 2026-10-21): nothing records the claim now, and the BYE's reason is
 * read from the draw. `West|2|2` holds `West|1|3`'s produced walkover alone on its side, so its loser will be nobody
 * (`feederSendsNobody`: `EXIT_PENDING`; while the probe stands `West|2|2` is a BYE matchUp, `FEEDER_HOLDS_BYE`), and
 * the seat is among those `West|1|3` is the reason for (`byeSeatsOwedTo`), in the probed draw and after the clear
 * alike.
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

/** why `key` sends nobody across its loser link, and the seats `owner` is the reason for, as the draw stands */
function derived(drawId: string, key: string, owner: string) {
  const drawDefinition = getDrawDefinition(drawId);
  const inContextDrawMatchUps = getDrawMatchUps(drawId);
  const feeder = find(inContextDrawMatchUps, key);
  const loserTargetLink = positionTargets({ matchUpId: feeder.matchUpId, inContextDrawMatchUps, drawDefinition })
    ?.targetLinks?.loserTargetLink;
  const matchUpId = find(inContextDrawMatchUps, owner).matchUpId;
  return {
    reason: feederSendsNobody({ inContextDrawMatchUps, loserTargetLink, drawDefinition, feeder }),
    owed: byeSeatsOwedTo({ inContextDrawMatchUps, drawDefinition, matchUpId }).map(coordinate),
  };
}

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
  const probedReading = derived(drawId, 'West|2|2', 'West|1|3');
  const cleared = observeMutation({ ...mutation(probe, clearOutcome), drawId });
  expect(cleared.error).toBeUndefined();
  const after = getDrawMatchUps(drawId);
  const restored = normalize(projectDraw(getDrawDefinition(drawId)));
  const afterReading = derived(drawId, 'West|2|2', 'West|1|3');
  return { scheduled, probed, probedReading, after, afterReading, before, restored };
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

it("the probe's BYE goes on into West|2|2, beside West|1|3's produced walkover, whose loser seat holds a BYE", () => {
  const { scheduled, probed, probedReading } = roundTrip('live-claim-probed');
  const owner = find(scheduled, 'West|1|3').matchUpId;
  expect(find(probed, 'West|1|4').matchUpStatus).toEqual(BYE);
  expect(find(probed, 'West|2|2').matchUpStatus).toEqual(BYE);
  expect(find(probed, 'West|2|2').sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(owner);
  expect(occupants(find(probed, 'Southwest|1|1'))).toEqual([undefined, 'BYE']);
  expect(find(probed, 'Southwest|1|1').sideExitProvenance?.[2]).toBeUndefined();
  // West|2|2 is itself a BYE matchUp while the probe stands
  expect(probedReading.reason).toEqual('FEEDER_HOLDS_BYE');
  expect(probedReading.owed).toContain('Southwest|1|1');
});

it("the BYE at West|2|2's loser seat stands on West|1|3's account once the probe is cleared", () => {
  const { after, afterReading } = roundTrip('live-claim-seat');
  expect(find(after, 'West|1|3').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find(after, 'West|2|2').matchUpStatus).toEqual(WALKOVER);
  expect(find(after, 'West|2|2').winningSide).toBeUndefined();
  expect(occupants(find(after, 'Southwest|1|1'))).toEqual([undefined, 'BYE']);
  expect(find(after, 'Southwest|1|1').matchUpStatus).toEqual(BYE);
  expect(find(after, 'Southwest|1|1').sideExitProvenance?.[2]).toBeUndefined();
  expect(afterReading.reason).toEqual('EXIT_PENDING');
  expect(afterReading.owed).toContain('Southwest|1|1');
});
