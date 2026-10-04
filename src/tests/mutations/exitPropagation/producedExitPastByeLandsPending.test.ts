import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Q3, CA 2026-10-03: *"Yes, land pending"*. A produced exit advanced past a BYE is still a produced
 * exit, so it lands pending (no winningSide) until its opponent arrives, as it does without the BYE.
 *
 * FEED_IN_CHAMPIONSHIP 16/16, the matrix's own schedule at seeds 397-400: a double exit at
 * `Consolation|4|1` produces an exit, the BYE at `Consolation|5|1` carries it on to `Consolation|6|1`,
 * whose side 1 is drawPosition 1, reserved by a feed link for the loser of the Main final. v1 awarded
 * that seat while nobody was in it. `exitAwardedToVacantSeat.test.ts` (P29) pins which side wins once
 * somebody arrives; this pins that nothing is awarded before.
 */
const CELLS = [
  { exitStatus: DOUBLE_WALKOVER, propagateExitStatus: true, seed: 397 },
  { exitStatus: DOUBLE_WALKOVER, propagateExitStatus: false, seed: 398 },
  { exitStatus: DOUBLE_DEFAULT, propagateExitStatus: true, seed: 399 },
  { exitStatus: DOUBLE_DEFAULT, propagateExitStatus: false, seed: 400 },
];

it.each(CELLS)(
  'a produced exit carried past a BYE lands pending: $exitStatus propagate=$propagateExitStatus',
  ({ exitStatus, propagateExitStatus, seed }) => {
    setSubscriptions({});
    const drawId = `past-bye-pending-${seed}`;
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 16 }],
      nonRandom: seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    const final = () =>
      tournamentEngine
        .allDrawMatchUps({ drawId, inContext: true })
        .matchUps.find((m: any) => m.stage === CONSOLATION && m.roundNumber === 6 && m.roundPosition === 1);

    // the matrix schedule: the exit on the first playable matchUp, then every third step (`playForward`)
    const outcome = { matchUpStatus: exitStatus };
    let target = nextPlayable(drawId);
    observeMutation({ propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });

    let pendingSeen = 0;
    const skip = new Set<string>();
    for (let taken = 0; taken < 200; taken++) {
      target = nextPlayable(drawId, skip);
      if (!target) break;
      const stepOutcome = taken % 3 === 2 ? outcome : { winningSide: 1 };
      const observed = observeMutation({
        propagateExitStatus,
        matchUpId: target.matchUpId,
        drawId,
        outcome: stepOutcome,
      });
      if (!observed.mutated) skip.add(target.matchUpId);

      const consolationFinal = final();
      const holdsExit = Object.values(consolationFinal.sideExitProvenance ?? {}).length > 0;
      const occupied = consolationFinal.sides?.some((side: any) => side?.participantId);
      if (holdsExit && !occupied) {
        pendingSeen += 1;
        // the seat holds a drawPosition, reserved by the feed link, and nobody: nothing is awarded
        expect(consolationFinal.winningSide).toBeUndefined();
      }
    }

    // CONTROL: the shape was reached, so the assertion inside the loop ran
    expect(pendingSeen).toBeGreaterThan(0);

    // and the arrival resolved it onto the participant who arrived
    const resolved = final();
    const occupant = resolved.sides.find((side: any) => side?.participantId);
    expect(occupant).toBeDefined();
    expect(resolved.winningSide).toEqual(occupant.sideNumber);
  },
);
