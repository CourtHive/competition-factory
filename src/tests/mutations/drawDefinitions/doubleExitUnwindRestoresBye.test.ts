/**
 * Regression cover for the BYE half of the double-exit unwind.
 *
 * Applying a double exit and then clearing it must restore the draw. It did not: a consolation
 * matchUp that was `BYE` beforehand came back `TO_BE_PLAYED`, while its positionAssignment still
 * said `bye: true` — an internal contradiction that no state-level check expresses, because no
 * invariant requires the matchUp's status to agree with its assignment.
 *
 * The cause was `removeDoubleExit`'s `getMatchUpStatus` asking `noContextTargetMatchUp.matchUpStatus
 * === BYE`. By the time the unwind reaches that line the cascade has already OVERWRITTEN the BYE
 * with the exit it propagated (measured: BYE -> WALKOVER on apply), so the question is put to a
 * field the cascade has clobbered. The positionAssignment is the durable record and still says
 * `bye: true`; consulting it restores the BYE.
 *
 * Six draw-type/size cells were quarantined for this and are now closed. The remaining
 * DO_UNDO_IDENTITY entries are two DIFFERENT mechanisms (drawPositions and matchUpStatusCodes) —
 * see `knownFailures.ts`.
 */
import { clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { nextPlayable, playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, BYE } from '@Constants/matchUpStatusConstants';

/**
 * The matchUps that read BYE, by id.
 *
 * Deliberately NOT "every matchUp on a BYE drawPosition must read BYE" — that is not an invariant.
 * A propagated exit legitimately sits on a BYE-held drawPosition while a double exit is
 * outstanding (measured: a Consolation matchUp reads DEFAULTED there mid-cascade). The property
 * asserted here is the round trip: whatever was BYE before must be BYE again afterwards.
 */
function byeMatchUpIds(drawId: string): string[] {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return (drawDefinition.structures ?? [])
    .flatMap((structure: any) => structure.matchUps ?? [])
    .filter((matchUp: any) => matchUp.matchUpStatus === BYE)
    .map((matchUp: any) => matchUp.matchUpId)
    .sort((a: string, b: string) => a.localeCompare(b));
}

describe.each([
  // [drawType, drawSize, participantsCount, seed] — seeds match the exit-propagation properties matrix
  [FIRST_MATCH_LOSER_CONSOLATION, 8, 8, 35],
  [FIRST_MATCH_LOSER_CONSOLATION, 16, 16, 43],
  [CURTIS_CONSOLATION, 16, 15, 111],
])('%s %d/%d — unwinding a double exit', (drawType: any, drawSize: any, participantsCount: any, seed: any) => {
  it.each([DOUBLE_WALKOVER, DOUBLE_DEFAULT])('restores a BYE matchUp rather than blanking it (%s)', (exitStatus) => {
    setSubscriptions({});
    const drawId = `unwind-bye-${drawType}-${drawSize}-${participantsCount}-${exitStatus}`;
    const outcome = { matchUpStatus: exitStatus };

    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawType, drawSize, participantsCount }],
      nonRandom: seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);

    playForward({ propagateExitStatus: true, exitOutcome: outcome, maxSteps: 5, drawId });

    const target = nextPlayable(drawId);
    expect(target?.matchUpId).toBeDefined();

    // CONTROL: the probe is worthless unless the draw actually holds BYE matchUps at this point
    const byesBefore = byeMatchUpIds(drawId);
    expect(byesBefore.length).toBeGreaterThan(0);

    const applied: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      drawId,
      outcome,
    });
    expect(applied.error).toBeUndefined();

    const cleared: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      drawId,
      outcome: clearOutcome,
    });
    expect(cleared.error).toBeUndefined();

    // every matchUp that was a BYE before the double exit is a BYE again after it is cleared
    expect(byeMatchUpIds(drawId)).toEqual(byesBefore);
  });
});
