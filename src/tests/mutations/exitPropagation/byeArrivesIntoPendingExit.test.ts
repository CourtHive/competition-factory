import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import scenarios from '@Tests/testHarness/exitPropagation/byeArrivesIntoPendingExit.scenarios.json';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it, describe } from 'vitest';

/**
 * A BYE arriving into the slot a propagated exit is WAITING ON must not become its winner.
 *
 * `progressExitStatus` RULE 2 awards a carried walkover to the side WITHOUT the exit — the empty
 * slot that will receive whoever falls through from elsewhere — and writes that award BEFORE anyone
 * arrives. It is a legitimate shape, and `getStructureInconsistencies` says so in as many words:
 * *"A PENDING propagated exit legitimately has an empty winner slot."*
 *
 * The hole is what happens when the thing that arrives is a **BYE**. Nobody will ever come, the
 * pending exit can never resolve, and the matchUp stands recorded as the BYE having won by walkover.
 * `getExitWinningSide` states the rule this breaks outright — *"A BYE draw position can never be the
 * winning side."*
 *
 * RULE 1 already gives the answer for the case where the BYE is there FIRST — *"opponent is a BYE:
 * the participant advances through it… so this matchUp stays a BYE"*. `assignDrawPositionBye` now
 * reaches the same conclusion when the BYE arrives LAST: every earlier matchUp in the position's
 * chain that had awarded its result TO that position becomes a BYE with no winner. Scoped to the
 * awarded side, so a BYE on the LOSING side — a participant advancing past it, or an exit against an
 * emptied position — is left exactly as it is.
 *
 * ## Why recorded scenarios rather than a hand-built draw
 *
 * The state needs a double exit upstream, a consolation feed whose arrival never comes, and a BYE
 * routed into precisely that slot. Hand-building it is possible but proves only the one arrangement;
 * these are the arrangements the pipeline actually produced, across five draw types. Measured over
 * the two 600-seed census windows before this fix: 47 seeds, split evenly across both propagation
 * arms.
 *
 * The scenarios are VENDORED into this repo rather than read from the census fixture they were
 * lifted from. That fixture lives in a sibling repository, which resolves on a developer's machine
 * and does not exist in CI — the first version of this file read it by relative path, passed
 * `pnpm verify` locally, and collected ZERO tests in CI. A test that reads outside its own
 * repository is a test that does not run.
 */
describe('a BYE arriving into a pending propagated exit', () => {
  const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

  // Seeds measured to produce the state at a255f765d. Spread across draw types on purpose: the
  // defect is in the BYE-placement chain, which is shared, not in any one draw type's topology.
  const SEEDS = [
    { seed: 9000118, drawType: 'FEED_IN_CHAMPIONSHIP' },
    { seed: 9000151, drawType: 'CURTIS_CONSOLATION' },
    { seed: 9000200, drawType: 'MODIFIED_FEED_IN_CHAMPIONSHIP' },
    { seed: 9000384, drawType: 'COMPASS' },
    { seed: 9000448, drawType: 'FIRST_MATCH_LOSER_CONSOLATION' },
  ];

  /**
   * Checked after EVERY step, not once at the end.
   *
   * The state is transient in most of these seeds — a later step in the schedule happens to overwrite
   * the matchUp, so an end-of-replay assertion sees a clean draw and passes whether the code is fixed
   * or not. Measured: of five seeds the census reports, an end-state check reproduced ONE. The census
   * itself checks after every mutation, which is why it sees all five.
   *
   * A draw is not allowed to pass through this state on its way to a tidy one: any consumer reading
   * between two mutations sees a BYE credited with a win.
   */
  const replayCheckingEveryStep = (scenario: any): string[] => {
    setSubscriptions({});
    const drawId = `bye-pending-${scenario.seed}`;
    prepareDraw({ ...scenario.config, seed: scenario.seed }, drawId);
    const seen: string[] = [];
    let stepNumber = 0;
    for (const step of (scenario.steps ?? []) as Step[]) {
      stepNumber++;
      const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === key(step));
      if (!target) continue;
      observeMutation({
        propagateExitStatus: scenario.config.propagateExitStatus,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId,
      });
      const violations = getInvariantViolations({
        matchUps: getDrawMatchUps(drawId),
        drawDefinition: getDrawDefinition(drawId),
      }).filter((violation: any) => violation.rule === 'BYE_WON');
      for (const violation of violations) seen.push(`step ${stepNumber}: ${violation.detail}`);
    }
    return seen;
  };

  it.each(SEEDS)('leaves no BYE holding a win — seed $seed ($drawType)', ({ seed, drawType }) => {
    const scenario: any = scenarios.find((candidate: any) => candidate.seed === seed);
    expect(scenario).toBeTruthy(); // control: the recorded scenario must be present
    expect(scenario.config.drawType).toEqual(drawType); // control: and still name this draw type

    expect((scenario.steps ?? []).length).toBeGreaterThan(0); // control: an empty schedule mutates nothing

    expect(replayCheckingEveryStep(scenario)).toEqual([]);
  });
});
