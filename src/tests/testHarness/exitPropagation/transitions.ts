import { getInvariantViolations, describeViolations } from './invariants';
import type { InvariantViolation } from './invariants';

import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import tournamentEngine from '@Engines/syncEngine';

import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * Transition-level oracles for the exit-propagation pipeline.
 *
 * These assert properties of a *mutation*, not of a state, which is what makes them
 * independent of bracket semantics: none of them encodes any knowledge of how a draw is
 * supposed to progress, so none can inherit a bracket misconception from whoever wrote the
 * code under test. A single-state scanner cannot express any of them — the DOUBLE_ELIMINATION
 * findings that motivated this file leave a state `getDrawInconsistencies` reports as valid.
 */

// Keys whose values change on every write and carry no semantics for these properties.
const VOLATILE_KEYS = new Set(['updatedAt', 'createdAt', 'timeStamp', 'timestamp']);

/**
 * Deterministic, volatility-stripped serialization of a draw.
 *
 * Object keys are emitted in sorted order so a re-created-in-different-order object hashes
 * equal to the original — otherwise do/undo reports a difference wherever the engine rebuilt
 * an object rather than mutating it in place, which is noise, not signal.
 */
export function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      if (VOLATILE_KEYS.has(key)) continue;
      if (value[key] === undefined) continue;
      normalized[key] = normalize(value[key]);
    }
    return normalized;
  }
  return value;
}

/**
 * Stable hash for comparing a draw against a REBUILT copy of itself — do/undo, where the
 * engine may have re-created objects with keys in a different order.
 */
export const stableHash = (value: any): string => JSON.stringify(normalize(value));

/**
 * Collapse "absent" and "empty" to one value.
 *
 * Clearing a result leaves `matchUpStatusCodes: []` and `score: {}` where a never-played matchUp
 * has neither key at all. Both mean the same thing, and treating them as different made do/undo
 * fire on 112 of 144 cells — including a plain SINGLE_ELIMINATION walkover, which is the tell
 * that the property was wrong rather than the engine. Note this collapses empty against absent
 * ONLY: a populated array or object still differs from an empty one, so genuine residue
 * (`['WO']` decaying to `[]`) is still caught.
 */
const blankToNull = (value: any): any => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length ? value : null;
  if (typeof value === 'object') return Object.keys(value).length ? value : null;
  return value;
};

/**
 * Canonical two-slot form for `drawPositions`.
 *
 * The engine represents the same occupancy several ways depending on how it got there: `[4]`,
 * `[4, null]`, `[null, null]`, `[]` and absent all occur. drawPositions is POSITIONAL — index 0
 * is side 1 — so the padding must be preserved rather than compacted: `[null, 4]` is side 2 and
 * must never be collapsed to `[4]`. Padding to a fixed length keeps that distinction while
 * removing the representational noise.
 */
const canonicalDrawPositions = (drawPositions: any): any => {
  if (!Array.isArray(drawPositions)) return null;
  const slots = [drawPositions[0] ?? null, drawPositions[1] ?? null];
  return slots.some(Boolean) ? slots : null;
};

/**
 * The mutable surface of a draw: everything a `setMatchUpStatus` can legitimately change.
 *
 * Hashing the whole drawDefinition on both sides of every mutation was the dominant cost in the
 * matrix — a drawSize-16 feed-in draw serializes to a few hundred KB and it happened twice per
 * step. The projection is ~2% of that and covers every field the propagation pipeline writes:
 * per-matchUp status/winner/score/codes/positions, plus each structure's positionAssignments,
 * which is where BYE and participant placement lives.
 *
 * Anything outside the projection (extensions, timeStamps, notes) is either volatile or not
 * something an outcome mutation is entitled to touch, so excluding it removes noise rather than
 * signal. If a future defect writes outside this set it will still surface through the
 * structural invariants and the repo's integrity checker, which read the real draw.
 */
export function projectDraw(drawDefinition: any): any {
  const structures: any[] = [];
  const walk = (candidates: any[]) => {
    for (const structure of candidates ?? []) {
      structures.push({
        structureId: structure.structureId,
        // normalized: extensions carry a `createdAt` stamp, and an assignment whose only change
        // is a timestamp is not a mutation for any property here. An emptied `extensions` array
        // is dropped too — `removeExtension` leaves `[]` where the key was previously absent, and
        // the two mean the same thing.
        positionAssignments: (structure.positionAssignments ?? []).map((assignment: any) =>
          normalize({ ...assignment, extensions: assignment.extensions?.length ? assignment.extensions : undefined }),
        ),
        matchUps: (structure.matchUps ?? []).map((matchUp: any) => [
          matchUp.matchUpId,
          matchUp.matchUpStatus,
          matchUp.winningSide ?? null,
          canonicalDrawPositions(matchUp.drawPositions),
          blankToNull(matchUp.matchUpStatusCodes),
          // sideExitProvenance is projected too: a field the projection cannot see is a field the
          // properties cannot police, and an unobserved addition would look residue-free while
          // leaving state behind on every unwind.
          blankToNull(matchUp.sideExitProvenance),
          blankToNull(matchUp.score),
        ]),
      });
      if (structure.structures?.length) walk(structure.structures);
    }
  };
  walk(drawDefinition?.structures ?? []);
  return structures;
}

export const hash = (drawDefinition: any): string => JSON.stringify(projectDraw(drawDefinition));

export function getDrawDefinition(drawId: string): any {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return drawDefinition;
}

export function getDrawMatchUps(drawId: string): any[] {
  // inContext is required: without it matchUps come back with no `sides`, so every
  // participant-presence check silently reads undefined and every matchUp looks unplayable.
  const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
  return matchUps ?? [];
}

/** The set of matchUpIds that have been decided — used by the monotonicity property. */
export function decidedMatchUpIds(matchUps: any[]): Set<string> {
  return new Set(
    matchUps
      .filter(
        (matchUp: any) => matchUp.winningSide || (matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED),
      )
      .map((matchUp: any) => matchUp.matchUpId),
  );
}

export type Observation = {
  mutated: boolean;
  thrown?: string;
  error?: any;
  result?: any;
  before: string;
  after: string;
  invariantViolations: InvariantViolation[];
  /** inContext matchUps as of AFTER the mutation — reusable by a driver, saving a re-query */
  matchUps: any[];
};

/**
 * Apply one outcome and report everything the properties need, without asserting.
 *
 * Callers decide which observations are failures, because the matrix quarantines known ones.
 */
export function observeMutation({
  propagateExitStatus,
  matchUpId,
  priorHash,
  outcome,
  drawId,
}: {
  propagateExitStatus?: boolean;
  priorHash?: string;
  matchUpId: string;
  drawId: string;
  outcome: any;
}): Observation {
  // `priorHash` lets a driver carry the previous step's `after` forward as this step's `before`,
  // halving the number of full-draw reads in a play-forward loop.
  const before = priorHash ?? hash(getDrawDefinition(drawId));

  let result: any;
  let thrown: string | undefined;
  try {
    result = tournamentEngine.setMatchUpStatus({ propagateExitStatus, matchUpId, drawId, outcome });
  } catch (err: any) {
    thrown = String(err?.message ?? err);
  }

  const drawDefinition = getDrawDefinition(drawId);
  const after = hash(drawDefinition);
  const matchUps = getDrawMatchUps(drawId);
  const invariantViolations = getInvariantViolations({ matchUps, drawDefinition });

  return {
    mutated: before !== after,
    error: result?.error,
    invariantViolations,
    matchUps,
    thrown,
    result,
    before,
    after,
  };
}

/**
 * The repo's own integrity checker, run alongside rather than reimplemented.
 *
 * Called once per cell rather than per step: it re-derives inContext matchUps for the whole
 * draw and is far too expensive to run on every mutation. Note it did NOT flag the
 * DOUBLE_ELIMINATION states that motivated this harness — it is a complement to the transition
 * properties, not a substitute for them.
 */
export function checkIntegrity(drawId: string, matchUpId: string): PropertyFailure[] {
  const drawDefinition = getDrawDefinition(drawId);
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
  if (integrity?.valid !== false) return [];
  return [
    {
      property: 'DRAW_INCONSISTENCY',
      matchUpId,
      detail: JSON.stringify(integrity.inconsistencies),
    },
  ];
}

/** The outcome that clears a result — the `isClearScore` branch in setMatchUpState. */
export const clearOutcome = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

export type PropertyFailure = {
  property: string;
  matchUpId: string;
  detail: string;
};

/**
 * ERROR_IMPLIES_NO_MUTATION — the general form of the partial-mutation class.
 *
 * A returned error must leave state byte-identical. `engineInvoke` can restore a snapshot, but
 * only when the caller passes `rollbackOnError`, which is off by default; a direct
 * `setMatchUpStatus` gets no such protection, and that is the path this asserts.
 */
export function checkErrorAtomicity(observation: Observation, matchUpId: string): PropertyFailure[] {
  const failures: PropertyFailure[] = [];
  if (observation.thrown) {
    failures.push({
      property: 'NO_EXCEPTION_ESCAPES',
      matchUpId,
      detail: `${observation.thrown}${observation.mutated ? ' (state was mutated before the throw)' : ''}`,
    });
  }
  if (observation.error && observation.mutated) {
    failures.push({
      property: 'ERROR_IMPLIES_NO_MUTATION',
      matchUpId,
      detail: `returned ${JSON.stringify(observation.error)} after mutating the draw`,
    });
  }
  return failures;
}

export function checkInvariants(observation: Observation, matchUpId: string): PropertyFailure[] {
  if (!observation.invariantViolations.length) return [];
  return [
    {
      property: 'STRUCTURAL_INVARIANT',
      matchUpId,
      detail: describeViolations(observation.invariantViolations),
    },
  ];
}
