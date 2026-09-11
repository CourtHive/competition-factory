import { checkErrorAtomicity, checkInvariants, getDrawMatchUps, observeMutation } from './transitions';
import type { PropertyFailure } from './transitions';

import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * Deterministic forward driver.
 *
 * No RNG: matchUps are chosen in a canonical (structure, round, position) order so a failing
 * cell reproduces from its coordinates alone, with no seed to carry. Randomised exploration
 * belongs in the Button sweep; the in-suite matrix has to be reproducible from its name.
 */

/**
 * Stable ordering across runs.
 *
 * Deliberately does NOT key on structureId: those are freshly generated UUIDs, so ordering by
 * them makes the driver's choice of matchUp differ every run, and the set of cells that trip a
 * defect drifts between runs even with mocksEngine seeded. `stage`, `stageSequence` and
 * `structureName` are properties of the draw's shape and are identical for a given cell.
 */
const canonicalOrder = (a: any, b: any): number =>
  (a.stageSequence ?? 0) - (b.stageSequence ?? 0) ||
  String(a.stage).localeCompare(String(b.stage)) ||
  String(a.structureName).localeCompare(String(b.structureName)) ||
  (a.roundNumber ?? 0) - (b.roundNumber ?? 0) ||
  (a.roundPosition ?? 0) - (b.roundPosition ?? 0);

/**
 * A matchUp both sides of which hold a real participant, with no result yet.
 *
 * Restricting to fully-populated matchUps keeps the driver moving forward: an unpopulated
 * slot returns MISSING_ASSIGNMENTS, which is correct behaviour and would only add noise. Those
 * refusals are still interesting, but as a *refusal* property (does the engine refuse what the
 * UI offers) rather than as a forward step — see derivationAgreement.test.ts.
 */
function isPlayable(matchUp: any): boolean {
  if (matchUp.winningSide) return false;
  if (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED) return false;
  const assigned = (matchUp.sides ?? []).filter((side: any) => side?.participantId).length;
  return assigned === 2;
}

export function firstPlayable(matchUps: any[], skip: Set<string> = new Set()): any {
  return matchUps.filter((matchUp: any) => isPlayable(matchUp) && !skip.has(matchUp.matchUpId)).sort(canonicalOrder)[0];
}

export function nextPlayable(drawId: string, skip: Set<string> = new Set()): any {
  return firstPlayable(getDrawMatchUps(drawId), skip);
}

/**
 * Apply one outcome and collect every property failure it produced.
 */
export function step({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const observation = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  return [...checkErrorAtomicity(observation, matchUpId), ...checkInvariants(observation, matchUpId)];
}

/** A fully-populated, undecided matchUp the engine declined to score without changing state. */
export type Refusal = {
  matchUpId: string;
  outcome: any;
  error: any;
};

/**
 * Drive the draw forward to exhaustion, collecting failures at every step.
 *
 * `exitPeriod` places the cell's exit status on every Nth step rather than only at the start.
 * A single exit followed by clean scores does not reach the states that matter: the
 * DOUBLE_ELIMINATION defects this harness was built for need exits meeting each other, and an
 * exit on a *late* matchUp — a backdraw final — which a front-loaded schedule never produces.
 * Measured: with a single leading exit the matrix found nothing across 600 cells; with a
 * periodic schedule it reproduces the known findings.
 *
 * `maxSteps` is a runaway guard, not a coverage bound: it sits above the matchUp count of the
 * largest draw in the matrix, so reaching it means the driver stopped making progress, which is
 * itself worth reporting.
 */
export function playForward({ propagateExitStatus, exitOutcome, exitPeriod = 3, maxSteps = 200, drawId }): {
  failures: PropertyFailure[];
  refusals: Refusal[];
} {
  const failures: PropertyFailure[] = [];
  const refusals: Refusal[] = [];
  // A refused matchUp stays playable forever, so without a skip set the driver spins on it until
  // maxSteps and reports a stall that is really a refusal. Refusals are collected instead and
  // adjudicated by the agreement oracle, which can tell a legitimate refusal (the engine and the
  // UI both say no) from the #4778 class (the UI offers what the engine refuses).
  const skip = new Set<string>();

  // carried between iterations so each step reads the draw once instead of twice: the previous
  // step's post-state is this step's pre-state, and its matchUps are the candidate pool.
  let priorHash: string | undefined;
  let matchUps: any[] = getDrawMatchUps(drawId);

  for (let taken = 0; taken < maxSteps; taken++) {
    const target = firstPlayable(matchUps, skip);
    if (!target) return { failures, refusals };

    const outcome = exitOutcome && taken % exitPeriod === exitPeriod - 1 ? exitOutcome : { winningSide: 1 };
    const observation = observeMutation({
      matchUpId: target.matchUpId,
      propagateExitStatus,
      priorHash,
      outcome,
      drawId,
    });
    priorHash = observation.after;
    matchUps = observation.matchUps;

    failures.push(
      ...checkErrorAtomicity(observation, target.matchUpId),
      ...checkInvariants(observation, target.matchUpId),
    );
    // a cell that has already violated a property will keep violating it on every subsequent
    // step; stop at the first so the report names a cause rather than a cascade.
    if (failures.length) return { failures, refusals };

    if (!observation.mutated) {
      refusals.push({ matchUpId: target.matchUpId, error: observation.error, outcome });
      skip.add(target.matchUpId);
    }
  }

  failures.push({
    property: 'DRIVER_DID_NOT_CONVERGE',
    matchUpId: '-',
    detail: `still playable after ${maxSteps} steps`,
  });
  return { failures, refusals };
}
