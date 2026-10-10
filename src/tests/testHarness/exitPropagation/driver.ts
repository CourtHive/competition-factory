import { checkErrorAtomicity, checkInvariants, getDrawMatchUps, observeMutation } from './transitions';
import type { PropertyFailure } from './transitions';

// constants
import { completedMatchUpStatuses, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

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

/**
 * A TEAM dual no score can decide: both sides present, no winner, every rubber finished. DOMINANT_DUO
 * at 1-1 with its third rubber a DOUBLE_WALKOVER is the shape — neither team can reach the value goal,
 * nothing in the dual is playable, and the round it feeds waits forever. That is the director's call,
 * not the engine's: `matchUpActions` offers STATUS and SCORE on such a dual and `setMatchUpStatus` with
 * a `winningSide` records it COMPLETED 1-1 and advances the winner (measured on the uneven-dual arm's
 * cell 550007, 2026-10-11).
 *
 * The driver used to stop here, leaving the draw in a state no director would, and then audited it.
 * With `STALLED_POSITION` a warning that audit passed vacuously; as an error it reported the next
 * round's lone occupant stranded on all 16 early-mode DOUBLE_WALKOVER / DOUBLE_DEFAULT cells — a true
 * reading of a draw the harness itself had abandoned. The driver now decides the dual as a director
 * would (`winningSideFor`, side 1 by default), and only once nothing else is playable.
 */
function isUndecidableDual(matchUp: any): boolean {
  const rubbers = matchUp.tieMatchUps ?? [];
  if (!rubbers.length || matchUp.winningSide) return false;
  const assigned = (matchUp.sides ?? []).filter((side: any) => side?.participantId).length;
  if (assigned !== 2) return false;
  return rubbers.every((rubber: any) => rubber.winningSide || completedMatchUpStatuses.includes(rubber.matchUpStatus));
}

export function firstUndecidableDual(matchUps: any[], skip: Set<string> = new Set()): any {
  return matchUps
    .filter((matchUp: any) => isUndecidableDual(matchUp) && !skip.has(matchUp.matchUpId))
    .sort(canonicalOrder)[0];
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
 *
 * `winningSideFor` chooses the winner of each scored (non-exit) step; side 1 when absent, which is how every
 * cell composed before it plays. The TEAM uneven-dual arm uses it to give a dual's eventual loser a rubber.
 */
export function playForward({
  propagateExitStatus,
  winningSideFor,
  exitPeriod = 3,
  maxSteps = 200,
  exitOutcome,
  drawId,
}: {
  winningSideFor?: (matchUp: any) => number;
  propagateExitStatus: boolean;
  exitPeriod?: number;
  exitOutcome: any;
  maxSteps?: number;
  drawId: string;
}): {
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
    const playable = firstPlayable(matchUps, skip);
    const target = playable ?? firstUndecidableDual(matchUps, skip);
    if (!target) return { failures, refusals };

    // a director's decision on an undecidable dual is a result, never an exit
    const exitStep = playable && exitOutcome && taken % exitPeriod === exitPeriod - 1;
    const outcome = exitStep ? exitOutcome : { winningSide: winningSideFor?.(target) ?? 1 };
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
