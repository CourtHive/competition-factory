import { getDrawDefinition, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * A CORRECTION LEAVES THE DRAW FORWARD PLAY LEAVES, AND AN EXIT IT WITHDRAWS TAKES BACK THE BYE IT WAS WON OVER
 * (census run-17 baseline F3 MONOTONIC_DECISION, COMPASS 16/13 seeds 20653852, 20633592, 20650012 and 20660566, policy
 * off).
 *
 * `East|1|5`'s double walkover produces an exit that `West|1|3`'s BYE carries into `West|2|2`. `East|1|7`'s walkover
 * sends its loser past `West|1|4`'s BYE to meet it there, and they win `West|2|2` by that exit; its loser is the exit,
 * so `Southwest|1|1`'s seat gets the BYE nobody can fill, owed to `West|2|2`. `East|1|5` corrected to a single
 * WALKOVER withdrew the exit and left `West|2|2` undecided between two participants, yet the BYE stood where forward
 * play has a seat waiting on `West|2|2`'s loser. A later result then took it back (MONOTONIC_DECISION).
 *
 * `West|2|2` once recorded a claim on that BYE (`byeClaims`); the ledger is retired (Mentat P58, CA 2026-10-21), so
 * what the claim stood for is read from the draw: before the correction the seat holds the BYE and `West|2|2` sends
 * nobody across its loser link (`feederSendsNobody`: `NOBODY_LOST`); after it, `West|2|2` sends somebody, and the
 * corrected draw, derived readings included, is the draw forward play leaves.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/aWithdrawnExitTakesItsByeClaim20653852.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const DOUBLE_EAST_1_5 = { at: 'East|1|5', outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } };
const WALKOVER_EAST_1_7 = { at: 'East|1|7', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } };
const WALKOVER_EAST_1_5 = { at: 'East|1|5', outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const drawDefinition = () => getDrawDefinition(drawId);
  for (const { at, outcome } of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  const names = new Map(matchUps().map((matchUp) => [matchUp.matchUpId, coordinate(matchUp)]));
  const inContextDrawMatchUps = matchUps();
  const sendsNobody = (feeder: any) => {
    const loserTargetLink = positionTargets({
      drawDefinition: drawDefinition(),
      matchUpId: feeder.matchUpId,
      inContextDrawMatchUps,
    })?.targetLinks?.loserTargetLink;
    if (!loserTargetLink) return undefined;
    return feederSendsNobody({ inContextDrawMatchUps, loserTargetLink, drawDefinition: drawDefinition(), feeder });
  };
  return Object.fromEntries(
    inContextDrawMatchUps.map((matchUp) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        sendsNobody: sendsNobody(matchUp),
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            {
              ...entry,
              sourceMatchUpId: names.get(entry?.sourceMatchUpId) ?? entry?.sourceMatchUpId,
            },
          ]),
        ),
      },
    ]),
  );
}

it('a double walkover corrected to a walkover takes back its BYE and leaves the draw the walkover leaves', () => {
  expect(config.seed).toEqual(20653852);
  const beforeCorrection = play([DOUBLE_EAST_1_5, WALKOVER_EAST_1_7], 'withdrawn-claim-before');
  expect(beforeCorrection['West|2|2'].matchUpStatus).toEqual('WALKOVER');
  // West|2|2's loser is the exit, so the seat it feeds holds the BYE nobody can fill
  expect(beforeCorrection['West|2|2'].sendsNobody).toEqual('NOBODY_LOST');
  expect(beforeCorrection['Southwest|1|1'].participants[1]).toEqual('BYE');
  expect(beforeCorrection['Southwest|1|1'].provenance['2']).toBeUndefined();

  const corrected = play([DOUBLE_EAST_1_5, WALKOVER_EAST_1_7, WALKOVER_EAST_1_5], 'withdrawn-claim-corrected');
  const forward = play([WALKOVER_EAST_1_7, WALKOVER_EAST_1_5], 'withdrawn-claim-forward');

  expect(corrected['West|2|2'].participants.filter(Boolean)).toHaveLength(2);
  expect(corrected['Southwest|1|1'].matchUpStatus).toEqual('TO_BE_PLAYED');
  expect(corrected['Southwest|1|1'].participants).not.toContain('BYE');
  expect(corrected['West|2|2'].sendsNobody).toBeUndefined();
  expect(corrected).toEqual(forward);
});
