import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BYE, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN EXIT RE-DELIVERED INTO ITS OWN SEAT IS NOT SENT ON (census S8, DRAW_INCONSISTENCY ORIGIN_ON_UNDECIDED_MATCHUP,
 * DOUBLE_ELIMINATION 16/11, seed 21030358, all three arms, shrunk from 30 steps to 9).
 *
 * `Main|1|7`'s default sends its loser into `Backdraw|3|1`, where the walkover `Main|1|5` carried past `Backdraw|2|2`'s
 * BYE already stands: a double walkover. Its produced walkover passes `Backdraw|4|1`'s BYE and lands pending on
 * `Backdraw|5|1` side 1, awaiting whoever arrives on side 2. Correcting `Main|2|2` from a double walkover to a default
 * sends its loser into `Backdraw|2|2`, which becomes a double walkover itself, and `Backdraw|3|1` re-settles with a
 * produced exit on side 2 where the carried one stood. The re-settled double walkover propagated again, past the same
 * BYE, into the seat its first pass already held, and the standing walkover was read as an exit meeting another:
 * `Backdraw|5|1` was advanced FROM as though decided, and the backdraw final became a WALKOVER recording an arrival
 * from a matchUp nobody had won. When `Backdraw|2|4`'s winner did win `Backdraw|5|1`, the final became TO_BE_PLAYED
 * still carrying that origin. Entered directly as a default, `Main|2|2` leaves the final undecided and unrecorded.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 21030358,
  drawSize: 16,
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const BEFORE_CORRECTION = [
  at('Main|1|2', { winningSide: 1 }),
  at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];
const CORRECTION = at('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 });
const AFTER_CORRECTION = [
  at('Main|2|4', { winningSide: 1 }),
  at('Backdraw|2|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
const SCHEDULE = [...BEFORE_CORRECTION, CORRECTION, ...AFTER_CORRECTION];
const DIRECT = [...BEFORE_CORRECTION.filter((step) => step.roundNumber !== 2 || step.roundPosition !== 2), CORRECTION];

const ARMS = [
  { arm: 'doubleExitPropagateBye on', policy: undefined },
  { arm: 'doubleExitPropagateBye off', policy: POLICY_OFF },
];

function drawAfter(steps: Step[], drawId: string, policy?: any) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, policy);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
  }
  // matchUpIds are fresh in every draw, so an origin is compared by the coordinate it names
  const matchUps = getDrawMatchUps(drawId);
  const coordinates = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  const byCoordinate = (provenance: any) =>
    provenance &&
    Object.fromEntries(
      Object.entries(provenance).map(([sideNumber, entry]: [string, any]) => [
        sideNumber,
        {
          ...entry,
          ...(entry.sourceMatchUpId && { sourceMatchUpId: coordinates.get(entry.sourceMatchUpId) }),
          ...(entry.byeClaims && { byeClaims: entry.byeClaims.map((id: string) => coordinates.get(id)) }),
        },
      ]),
    );
  return Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        sideExitProvenance: byCoordinate(matchUp.sideExitProvenance),
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
}

describe.each(ARMS)('$arm', ({ policy }) => {
  it('the census schedule replays clean', () => {
    setSubscriptions({});
    expect(replay(CONFIG, SCHEDULE, 'redelivered-exit-census', policy)).toBeNull();
  });

  it('the correction leaves the pending walkover pending and the backdraw final undecided', () => {
    const corrected = drawAfter([...BEFORE_CORRECTION, CORRECTION], 'redelivered-exit-corrected', policy);
    expect(corrected['Backdraw|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(corrected['Backdraw|5|1'].matchUpStatus).toEqual(WALKOVER);
    expect(corrected['Backdraw|5|1'].winningSide).toBeUndefined();
    expect(corrected['Backdraw|6|1'].matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(corrected['Backdraw|6|1'].sideExitProvenance).toBeUndefined();
  });

  it('the winner of the pending walkover arrives in the final with no origin recorded', () => {
    const played = drawAfter(SCHEDULE, 'redelivered-exit-played', policy);
    const winner = played['Backdraw|5|1'].occupants[1];
    expect(winner).toBeDefined();
    expect(played['Backdraw|5|1'].winningSide).toEqual(2);
    expect(played['Backdraw|6|1'].matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(played['Backdraw|6|1'].occupants[1]).toEqual(winner);
    expect(played['Backdraw|6|1'].sideExitProvenance).toBeUndefined();
  });

  it('the double walkover and its correction leave the draw the default alone leaves', () => {
    const corrected = drawAfter([...BEFORE_CORRECTION, CORRECTION], 'redelivered-exit-twice', policy);
    const direct = drawAfter(DIRECT, 'redelivered-exit-direct', policy);
    expect(corrected).toEqual(direct);
  });
});
