import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { DOUBLE_DEFAULT, TO_BE_PLAYED, DEFAULTED, BYE } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * RE-SCORING one feeder must not destroy the origin recorded by the OTHER.
 *
 * Two adjacent first-round matchUps feed one consolation matchUp. Both double-exit, so that matchUp
 * is a convergence carrying TWO origins. Re-scoring one of the feeders unwinds it — and the unwind
 * used to reset the target wholesale through the `toBePlayed` fixture, which blanks
 * `sideExitProvenance`. The surviving feeder's origin went with it, and the target settled as a
 * single exit awarded to a drawPosition nobody could ever fill, with nothing propagated onward.
 *
 * Measured 2026-09-19 over the 14 trustworthy dead-reservation seeds of the frozen `sched-w1`
 * window: **13 of 14 require a re-score** and **11 of 14 reduce to three steps**. It is not limited
 * to correcting a mistake — the transitions include `normal -> double`, `single exit -> double`,
 * `RETIRED -> double`, and re-entering the IDENTICAL outcome, which is an idempotence failure that
 * needs no change of mind by the director.
 *
 * ## The control is the whole test
 *
 * Steps 2 and 3 alone reach the same end state by a route that involves no unwind at all. So the
 * assertion is not "the three-step run looks right to me" — it is "the three-step run is
 * INDISTINGUISHABLE from the two-step control", which cannot be satisfied by a status the unwind
 * happens to guess correctly. Provenance and `matchUpStatusCodes` are compared too: a status that
 * agrees while the provenance underneath it does not is the exact shape this defect had.
 *
 * `nonRandom: 9000230` fixes participant placement, and the coordinate assertions below fail loudly
 * if it ever stops doing so rather than replaying nothing.
 */

type Step = { roundPosition: number; outcome: any };

const DOUBLE_EXIT_P2: Step = { roundPosition: 2, outcome: { matchUpStatus: DOUBLE_DEFAULT } };
const DOUBLE_EXIT_P1: Step = { roundPosition: 1, outcome: { matchUpStatus: DOUBLE_DEFAULT } };
const CORRECT_P2: Step = { roundPosition: 2, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } };

function run(label: string, steps: Step[]) {
  setSubscriptions({});
  const drawId = `unwind-rederive-${label}`;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 9000230,
    setState: true,
  });
  // CONTROL: a draw that generated nothing would satisfy every assertion below vacuously.
  expect(getDrawMatchUps(drawId).length).toBeGreaterThan(0);

  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find(
      (matchUp: any) =>
        matchUp.structureName === 'Main' && matchUp.roundNumber === 1 && matchUp.roundPosition === step.roundPosition,
    );
    // CONTROL: a coordinate that names no matchUp would silently skip the step.
    expect(target, `${label}: no Main|1|${step.roundPosition}`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
      drawId,
    });
    expect(
      result.error,
      `${label}: Main|1|${step.roundPosition} returned ${JSON.stringify(result.error)}`,
    ).toBeUndefined();
  }

  const projected: Record<string, any> = {};
  for (const structure of getDrawDefinition(drawId).structures ?? []) {
    for (const matchUp of structure.matchUps ?? []) {
      projected[`${structure.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`] = {
        // An empty array and an absent key are the same statement — "no codes on this matchUp" —
        // and `transitions.ts`' `blankToNull` is where the harness already says so. Normalising with
        // the same rule keeps this test from failing on a distinction the engine's own identity
        // projection does not draw. It does NOT hide a lost code: a non-empty array stays itself.
        matchUpStatusCodes: matchUp.matchUpStatusCodes?.length ? matchUp.matchUpStatusCodes : null,
        // sourceMatchUpId is a fresh UUID per generated draw, so it cannot be compared between the
        // two runs; that every entry HAS one is asserted separately below.
        sideExitProvenance: matchUp.sideExitProvenance
          ? Object.fromEntries(
              Object.entries(matchUp.sideExitProvenance).map(([side, entry]: any) => [
                side,
                { matchUpStatus: entry?.matchUpStatus, previousMatchUpStatus: entry?.previousMatchUpStatus },
              ]),
            )
          : null,
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide ?? null,
        drawPositions: matchUp.drawPositions ?? null,
      };
    }
  }
  return projected;
}

test('re-scoring one feeder leaves the other feeder’s origin standing', () => {
  const control = run('control', [DOUBLE_EXIT_P1, CORRECT_P2]);
  const corrected = run('corrected', [DOUBLE_EXIT_P2, DOUBLE_EXIT_P1, CORRECT_P2]);

  // CONTROL: the convergence must actually have formed, or the comparison is between two draws in
  // which nothing interesting happened.
  expect(control['Consolation|1|1'].matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(control['Consolation|1|1'].winningSide).toBeNull();
  expect(Object.keys(control['Consolation|1|1'].sideExitProvenance ?? {})).toEqual(['1', '2']);
  /**
   * AND THE EXIT MUST REACH THE NEXT ROUND, which is what a dead reservation silently loses.
   *
   * This asserted `Consolation|2|1` was `DEFAULTED` — the produced exit having OVERWRITTEN the BYE
   * that matchUp holds. CA ruled otherwise on 2026-09-20: *"a propagated exit encountering a BYE
   * should be advanced. In both cases the BYE remains a BYE"* — *"the `matchUpStatus: BYE` does not
   * change."* Measured: `Consolation|2|1` holds drawPosition 1 and nothing else, and drawPosition 1
   * is a draw BYE.
   *
   * THE TEST'S CLAIM IS UNCHANGED, only where it reads the answer. The exit still reaches this
   * matchUp; it is recorded on the side it arrived on rather than in the status. Asserting the
   * provenance is the stronger form anyway — a status says an exit is here, the per-side record
   * says WHICH side and WHAT it came from, which is the fact a dead reservation loses.
   */
  expect(control['Consolation|2|1'].matchUpStatus).toEqual(BYE);
  expect(control['Consolation|2|1'].sideExitProvenance?.['2']).toEqual({
    previousMatchUpStatus: DOUBLE_DEFAULT,
    matchUpStatus: DEFAULTED,
  });

  // THE PROPERTY: the corrected route is indistinguishable from the control.
  expect(corrected).toEqual(control);

  // Named separately so a failure says WHICH fact was lost rather than printing the whole draw.
  expect(corrected['Consolation|1|1'].matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(corrected['Consolation|1|1'].winningSide).toBeNull();
  expect(corrected['Consolation|2|1'].matchUpStatus).toEqual(BYE);
  expect(corrected['Consolation|2|1'].sideExitProvenance?.['2']).toEqual({
    previousMatchUpStatus: DOUBLE_DEFAULT,
    matchUpStatus: DEFAULTED,
  });
  // the dead reservation this test exists for: the side would read as undecided, with no origin
  expect(corrected['Consolation|2|1'].matchUpStatus).not.toEqual(TO_BE_PLAYED);
  expect(corrected['Consolation|2|1'].sideExitProvenance).not.toBeNull();
});
