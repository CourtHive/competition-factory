import { generateSchedule, prepareDraw, randomConfig, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * Provenance must outlive the codes for as long as the EXIT it describes is still standing.
 *
 * `attemptToModifyScore` coerces an absent `matchUpStatusCodes` to `[]`, so `[]` means both "blank
 * the codes" and "the caller supplied none". Three sites read the second as the first and cleared
 * `sideExitProvenance` from a matchUp that was still a WALKOVER or DEFAULTED. Measured 2026-09-11
 * across the draws behind the 21 triaged sweep seeds: **63 clears, 51 of them leaving the matchUp
 * still an exit** — `removeDirectedLoser` 38, `applyPositionToMatchUp` 9, `applyScoreAndStatus` 10.
 *
 * Such a matchUp is an exit with no marker at all, so `exitProducedByPropagation` reads false and
 * `EXIT_WITHOUT_LOSER` / `DROPPED_PROGRESSION` fire on a legitimate pending exit.
 *
 * These are sweep seeds rather than hand-built draws on purpose. A grid of 1,512 deterministic
 * first-round scenarios — 7 draw types x 2 sizes x 3 participant counts x every first-round
 * position x two exit statuses x three action patterns — produced **zero** instances. The state
 * needs the deeper randomized sequences the sweep reaches, so the seed IS the smallest
 * reproduction available.
 *
 * Three seeds, not the five this change clears in a full run. `6161618` passes on master when this
 * file runs alone — two of the 21 triaged seeds are sensitive to how much draw generation precedes
 * them, which is recorded in the triage — and `6341977` still reports a DROPPED_PROGRESSION from a
 * different cause. A test that is not red before the fix is not a regression test, so only the
 * three that are red here are asserted.
 */

const EXIT_STATUSES = [WALKOVER, DEFAULTED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

it.each([{ seed: 6041718 }, { seed: 6101993 }, { seed: 6161873 }])(
  'sweep seed $seed no longer reports an orphaned exit or a dropped progression',
  ({ seed }) => {
    setSubscriptions({});
    const config = randomConfig(seed);
    const drawId = `sweep-${seed}`;
    expect(prepareDraw(config, drawId)).toEqual(true);

    const steps = generateSchedule(config, drawId, 30);
    // the control: a schedule with no steps would satisfy everything below vacuously
    expect(steps.length).toBeGreaterThan(0);

    // the second control: the draw must actually contain exits, or this asserts nothing about them
    const exits = getDrawMatchUps(drawId).filter((matchUp: any) => EXIT_STATUSES.includes(matchUp.matchUpStatus));
    expect(exits.length).toBeGreaterThan(0);

    // `replay` ends on the repo's own integrity checker — the oracle the sweep census counts.
    expect(replay(config, steps, drawId)).toEqual(null);
  },
);
