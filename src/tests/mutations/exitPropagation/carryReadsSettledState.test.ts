import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, TO_BE_PLAYED, DEFAULTED, BYE } from '@Constants/matchUpStatusConstants';

/**
 * A PROPAGATION DECISION MAY ONLY BE TAKEN ON STATE DERIVED AFTER THE WRITES THAT PRECEDE IT.
 *
 * `carryExitOnward` re-derived context between hops but took the FIRST hop's decisions from the
 * view it was handed — one computed in `conditionallyAdvanceDrawPosition` before this cascade's own
 * writes. One of those decisions is *"has somebody genuinely arrived here"*, which is exactly the
 * kind of fact the cascade changes as it runs.
 *
 * Measured: the stale view showed `CONSOLATION|3|1` holding a participant, so the carry refused as
 * designed — *not ours to overwrite*. The settled draw shows `sides=[{}, {}]`, no participant at
 * all. The exit stopped at `CONSOLATION|2|1` and the final stayed `TO_BE_PLAYED` forever, because
 * neither of its feeders can ever send anybody.
 *
 * The file already names this trap twice — `progressExitStatus`' provenance stamp rebuilds its map
 * because *"that one predates the `setMatchUpState` above"* — so the rule was known and this site
 * did not follow it.
 */
test('the carry decides on settled state, not the view it was handed', () => {
  setSubscriptions({});
  const drawId = 'carry-settled';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { participantsCount: 8, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'cs', drawId },
    ],
    setState: true,
  });

  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  const at = (stage: string, roundNumber: number, roundPosition: number): any =>
    matchUps().find(
      (m: any) => m.stage === stage && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );

  for (const step of [
    { roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    { roundPosition: 2, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  ]) {
    const target = at('MAIN', 1, step.roundPosition);
    expect(target, `MAIN|1|${step.roundPosition}`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error, `MAIN|1|${step.roundPosition}`).toBeUndefined();
  }

  // CONTROL: `CONSOLATION|2|1` must be the dead BYE-held matchUp this is about — a draw BYE on one
  // side and a slot whose feeder produced nobody on the other. Without that there is nothing to
  // carry past.
  const dead = at('CONSOLATION', 2, 1);
  expect(dead.matchUpStatus).toEqual(BYE);
  expect((dead.sides ?? []).filter((side: any) => side.participantId).length).toEqual(0);
  expect(dead.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);

  // CONTROL: and the final must hold nobody, or the carry is correctly refusing rather than stalling
  const final = at('CONSOLATION', 3, 1);
  expect((final.sides ?? []).filter((side: any) => side.participantId).length).toEqual(0);

  // THE ASSERTION: the exit travels past the dead matchUp and comes to rest on the final.
  expect(final.matchUpStatus).toEqual(DEFAULTED);
  expect(final.matchUpStatus).not.toEqual(TO_BE_PLAYED);
  // DEFAULTED rather than WALKOVER: a uniform double default produces its own flavour
  expect(final.sideExitProvenance?.[1]).toEqual({
    previousMatchUpStatus: DOUBLE_DEFAULT,
    matchUpStatus: DEFAULTED,
    sourceMatchUpId: at('CONSOLATION', 1, 1).matchUpId,
  });
});
