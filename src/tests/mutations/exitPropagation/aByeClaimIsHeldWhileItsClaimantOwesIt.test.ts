import { BYE_CLAIM_REASON, byeClaimReason } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { checkClaimsLive } from '@Tests/testHarness/exitPropagation/properties';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';

// constants
import {
  BYE,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A BYE CLAIM IS HELD WHILE ITS CLAIMANT OWES IT (Mentat P58, CA ruling 2026-10-21).
 *
 * `byeClaims` records who claims a BYE on a loser seat; why is read from the claimant as it stands (`byeClaimReason`),
 * never stored, because a stored reason goes stale when the claimant changes kind. `CLAIMS_LIVE` holds every replay's
 * final draw to it: a claim whose claimant owes no BYE is one an unwind missed.
 */

const carried = (matchUpStatus: string) => ({ matchUpStatus, sourceMatchUpId: 'feeder' });

describe('byeClaimReason reads why from the claimant as it stands', () => {
  it('a double exit owes the BYE its produced exit leaves', () => {
    expect(byeClaimReason({ matchUpId: 'm', matchUpStatus: DOUBLE_WALKOVER } as any)).toEqual(
      BYE_CLAIM_REASON.DOUBLE_EXIT_PRODUCED,
    );
    expect(byeClaimReason({ matchUpId: 'm', matchUpStatus: DOUBLE_DEFAULT } as any)).toEqual(
      BYE_CLAIM_REASON.DOUBLE_EXIT_PRODUCED,
    );
  });

  it('a BYE matchUp owes its loser seat a BYE', () => {
    expect(byeClaimReason({ matchUpId: 'm', matchUpStatus: BYE } as any)).toEqual(BYE_CLAIM_REASON.BYE_MATCHUP_LOSER);
  });

  it('an awarded single exit owes a BYE only when its losing side is a carried exit', () => {
    const awarded = (matchUpStatus: string, sideExitProvenance?: any) =>
      byeClaimReason({ matchUpId: 'm', matchUpStatus, winningSide: 1, sideExitProvenance } as any);
    expect(awarded(WALKOVER, { 2: carried(WALKOVER) })).toEqual(BYE_CLAIM_REASON.UNFILLABLE_LOSER);
    expect(awarded(RETIRED, { 2: carried(RETIRED) })).toEqual(BYE_CLAIM_REASON.UNFILLABLE_LOSER);
    // the winner's side carried the exit, so the loser is a real participant
    expect(awarded(WALKOVER, { 1: carried(WALKOVER) })).toBeUndefined();
    // a referee recorded the exit directly: the loser did not appear, and the loser link carries them
    expect(awarded(WALKOVER)).toBeUndefined();
  });

  it('anything else owes nothing', () => {
    expect(byeClaimReason(undefined)).toBeUndefined();
    expect(byeClaimReason({ matchUpId: 'm', matchUpStatus: TO_BE_PLAYED } as any)).toBeUndefined();
    expect(byeClaimReason({ matchUpId: 'm', matchUpStatus: WALKOVER } as any)).toBeUndefined();
  });
});

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 1 };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/** a COMPASS draw whose first round holds a double walkover and the BYE claim it leaves on its loser seat */
function drawWithAClaim(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  const doubleExit = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === 'East|1|1');
  observeMutation({
    propagateExitStatus: true,
    matchUpId: doubleExit.matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId,
  });
  const claims = getDrawMatchUps(drawId).flatMap((matchUp: any) =>
    Object.entries(matchUp.sideExitProvenance ?? {})
      .filter(([, entry]: [string, any]) => entry?.byeClaims?.length)
      .map(([side, entry]: [string, any]) => ({ matchUpId: matchUp.matchUpId, side, claimants: entry.byeClaims })),
  );
  expect(claims.length).toBeGreaterThan(0);
  return { doubleExit, seat: claims[0] };
}

/** set the seat's claims in the stored record, as a cascade would */
function setClaims(matchUpId: string, side: string, byeClaims: string[]) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const stored = tournamentRecord.events[0].drawDefinitions[0].structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);
  stored.sideExitProvenance = {
    ...stored.sideExitProvenance,
    [side]: { ...stored.sideExitProvenance[side], byeClaims },
  };
  tournamentEngine.setState(tournamentRecord);
}

describe('CLAIMS_LIVE', () => {
  it('passes the claims a double exit leaves', () => {
    const drawId = 'claims-live-held';
    const { doubleExit, seat } = drawWithAClaim(drawId);
    expect(seat.claimants).toEqual([doubleExit.matchUpId]);
    expect(checkClaimsLive(drawId)).toEqual([]);
  });

  it('fails a claim whose claimant owes no BYE, and one naming a matchUp that is not there', () => {
    const drawId = 'claims-live-dead';
    const { seat } = drawWithAClaim(drawId);
    const unplayed = getDrawMatchUps(drawId).find((matchUp: any) => matchUp.matchUpStatus === TO_BE_PLAYED);
    setClaims(seat.matchUpId, seat.side, [unplayed.matchUpId, 'no-such-matchUp']);
    const failures = checkClaimsLive(drawId);
    expect(failures.map((failure) => failure.property)).toEqual(['CLAIMS_LIVE', 'CLAIMS_LIVE']);
    expect(failures[0].detail).toContain(`${coordinate(unplayed)} (${TO_BE_PLAYED})`);
    expect(failures[1].detail).toContain('missing no-such-matchUp');
  });
});
