import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * CLEARING ONE DOUBLE EXIT MUST NOT DESTROY ANOTHER'S RECORD.
 *
 * CA, 2026-09-20, reading the reproduction below: *"when the [...] DOUBLE_WALKOVER is removed the
 * provenance of the sideNumber: 1 matchUpStatus: WALKOVER is lost... that's the bug."*
 *
 * `Consolation|3|1` is a WALKOVER produced by `Consolation|1|1`'s double walkover. Clearing a
 * DIFFERENT matchUp — `Consolation|1|2` — reset it to `TO_BE_PLAYED` and dropped its provenance,
 * even though `Consolation|1|1` is untouched and still a double walkover. `getUnwoundState`'s final
 * fallthrough returns `TO_BE_PLAYED` and drops the retained provenance on the floor, and
 * `conditionallyRemoveDrawPosition` wrote it unconditionally.
 *
 * The engine already contradicted itself here, which is why the fix is an identity test rather than
 * a new rule: in the same run `Consolation|2|2` KEEPS an entry from that very same origin, because
 * the BYE branch of `getUnwoundState` retains by identity. One branch withdrew by identity, the
 * other blanked wholesale.
 *
 * THE SEQUENCE IS THE `transitionProperties` WARM-UP, by hand, so this test names what that
 * property could only report as a byte offset: play the first playable matchUp five times, the
 * THIRD as a double walkover.
 */
test('clearing one double exit leaves a walkover produced by a DIFFERENT origin standing', () => {
  setSubscriptions({});
  const drawId = 'unwind-retains';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 8, idPrefix: 'ur' },
    ],
    nonRandom: 61,
    setState: true,
  });

  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  const at = (stage: string, roundNumber: number, roundPosition: number): any =>
    matchUps().find(
      (m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );

  for (let taken = 0; taken < 5; taken++) {
    const target = nextPlayable(drawId);
    expect(target, `warm-up step ${taken + 1} found nothing playable`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: taken % 3 === 2 ? { matchUpStatus: DOUBLE_WALKOVER } : { winningSide: 1 },
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.error, `warm-up step ${taken + 1}`).toBeUndefined();
  }

  // CONTROL: the warm-up must have left `CONSOLATION|1|1` a double exit whose walkover reached the
  // final, or there is no untouched origin for the clear to destroy and this test asserts nothing.
  expect(at('CONSOLATION', 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  const producedBy = at('CONSOLATION', 1, 1).matchUpId;
  const beforeFinal = at('CONSOLATION', 3, 1);
  expect(beforeFinal.matchUpStatus).toEqual(WALKOVER);
  expect(beforeFinal.sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(producedBy);

  // the matchUp being cleared is a DIFFERENT one
  const target = nextPlayable(drawId);
  expect(target.matchUpId).not.toEqual(producedBy);

  const applied: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(applied.error).toBeUndefined();

  const cleared: any = tournamentEngine.setMatchUpStatus({
    outcome: clearOutcome,
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(cleared.error).toBeUndefined();

  // THE ASSERTION: the untouched origin's walkover survives, whole.
  const afterFinal = at('CONSOLATION', 3, 1);
  expect(afterFinal.matchUpStatus).toEqual(WALKOVER);
  expect(afterFinal.sideExitProvenance?.[1]).toEqual({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
    sourceMatchUpId: producedBy,
  });

  // and the origin itself is still standing, which is what makes its record true
  expect(at('CONSOLATION', 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // while the matchUp actually cleared is back to pending
  expect(matchUps().find((m: any) => m.matchUpId === target.matchUpId).matchUpStatus).toEqual(TO_BE_PLAYED);
});
