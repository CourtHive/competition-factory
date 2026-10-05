import { checkIntegrity, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { prepareDraw, randomConfig, rng } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { EXIT } from '@Constants/matchUpActionConstants';

/**
 * **The census arm for a walkover or default recorded before the opponent arrives** (CA, 2026-10-04).
 *
 * The exit-propagation sweep targets matchUps with two participants only (its `replay` skips any other),
 * so a recorded exit beside an unreached seat was measured by hand-built cases alone. This plays random
 * draws forward, recording such exits wherever a participant stands alone, and asks at every step:
 *
 *  - **the offer and the engine agree**: a direct `WALKOVER`/`DEFAULTED` awarding the empty side is accepted
 *    exactly where `matchUpActions` offers `EXIT`, and the offer never awards the participant already there;
 *  - **no step throws, is refused after mutating, breaks an invariant, or leaves an inconsistent draw**.
 *
 * **A budget, like `verify:stall-budget`.** `KNOWN` lists the seeds that fail, each of which fails the same
 * way on `dev` when shrunk: with `propagateExitStatus` on, `dev` already accepted these entries, and this arm
 * is the first thing to have measured them. A seed outside `KNOWN` fails the test; a seed that closes is
 * reported so it can be struck.
 */
const SEEDS = Array.from({ length: 120 }, (_, index) => 9_700_001 + index);
const MAX_STEPS = 60;
const OUTCOMES = [
  { winningSide: 1 },
  { winningSide: 2 },
  { matchUpStatus: WALKOVER, winningSide: 1 },
  { matchUpStatus: DEFAULTED, winningSide: 2 },
];

/**
 * - ORIGIN_ON_UNDECIDED_MATCHUP after three recorded exits in West and a walkover in East: 9700009.
 *
 * Struck (closed by "an arrival carrying an exit converges", F3): 9700004, 9700018, 9700019, 9700049, 9700078,
 * 9700079, where a participant carrying an exit ARRIVED at a pending walkover, took it and advanced, and the
 * convergence `progressExitStatus` RULE 4 wrote behind it was refused after the draw had moved.
 */
const KNOWN = new Set([9700009]);

const undecided = (m: any) => !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === TO_BE_PLAYED);
const occupants = (m: any) => m.sides.filter((side: any) => side.participantId).length;

function check(observation: any, offered?: boolean): string | undefined {
  if (observation.thrown) return `threw: ${observation.thrown}`;
  if (offered === true && observation.error) return `EXIT offered but refused ${observation.error.code}`;
  if (offered === false && !observation.error) return 'accepted where EXIT was not offered';
  if (observation.error && observation.mutated) return `refused ${observation.error.code} after mutating`;
  if (observation.invariantViolations?.length) return JSON.stringify(observation.invariantViolations).slice(0, 200);
  return undefined;
}

function recordAnExit({ lone, drawId, propagateExitStatus, random }): string | undefined {
  const target = lone[Math.floor(random() * lone.length)];
  const emptySide = 3 - target.sides.find((side: any) => side.participantId).sideNumber;
  const offered = (tournamentEngine.matchUpActions({ drawId, matchUpId: target.matchUpId }).validActions ?? []).find(
    (action: any) => action.type === EXIT,
  );
  if (offered && offered.payload.outcome.winningSide !== emptySide) return 'EXIT awards the present participant';
  const outcome = { matchUpStatus: random() < 0.5 ? WALKOVER : DEFAULTED, winningSide: emptySide };
  return check(observeMutation({ matchUpId: target.matchUpId, propagateExitStatus, outcome, drawId }), !!offered);
}

function playSeed(seed: number): string | undefined {
  const config = randomConfig(seed);
  const drawId = `early-census-${seed}`;
  setSubscriptions({});
  if (!prepareDraw(config, drawId)) return undefined;
  const random = rng(seed ^ 0x2545f491);
  const { propagateExitStatus } = config;

  for (let step = 0; step < MAX_STEPS; step++) {
    const matchUps = getDrawMatchUps(drawId).filter(undecided);
    const lone = matchUps.filter((m: any) => occupants(m) === 1);
    const ready = matchUps.filter((m: any) => occupants(m) === 2);
    if (!lone.length && !ready.length) return undefined;

    let failure: string | undefined;
    if (lone.length && (!ready.length || random() < 0.35)) {
      failure = recordAnExit({ lone, drawId, propagateExitStatus, random });
    } else {
      const target = ready[Math.floor(random() * ready.length)];
      const outcome = OUTCOMES[Math.floor(random() * OUTCOMES.length)];
      failure = check(observeMutation({ matchUpId: target.matchUpId, propagateExitStatus, outcome, drawId }));
    }
    failure ??= checkIntegrity(drawId, '')[0]?.detail.slice(0, 300);
    if (failure) return `${config.drawType} ${config.drawSize}: ${failure}`;
  }
  return undefined;
}

/**
 * Twelve windows of ten seeds, each its own test. One test over all 120 took ~60s locally but 244s under
 * `verify:coverage` in CI, past the 180s timeout; a window stays well inside it.
 */
const WINDOWS = Array.from({ length: SEEDS.length / 10 }, (_, index) => SEEDS.slice(index * 10, index * 10 + 10));

// Under whichever pipeline the suite runs, so the `differential` run (into and on master) compares v2
// here too. It was pinned to v1 while seed 9700103 (COMPASS 32/27) diverged: a WALKOVER recorded at
// `West|2|4` carries its loser past a BYE into `Southwest|2|1`, where a DEFAULTED a double default
// produced stands pending on the unreached side; v1 converged it (DOUBLE_WALKOVER, right by
// exit-propagation.md's mixed rule) and the differential, finding that side by an in-context
// `sideNumber` an unreached side does not carry, expected a WALKOVER instead. Pinned by
// `aCarriedExitPastAByeMeetsAPendingProducedExit.test.ts`.
it.each(WINDOWS.map((seeds) => ({ seeds, from: seeds[0] })))(
  'seeds from $from: recorded exits beside an unreached seat stay within the known budget',
  ({ seeds }) => {
    const failing = seeds.map((seed) => ({ seed, failure: playSeed(seed) })).filter(({ failure }) => failure);
    const unexpected = failing.filter(({ seed }) => !KNOWN.has(seed));
    const closed = seeds.filter((seed) => KNOWN.has(seed) && !failing.some((entry) => entry.seed === seed));
    expect(unexpected).toEqual([]);
    expect(closed).toEqual([]);
  },
  180_000,
);
