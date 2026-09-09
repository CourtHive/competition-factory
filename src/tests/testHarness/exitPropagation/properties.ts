import { clearOutcome, getDrawDefinition, getDrawMatchUps, hash, observeMutation, stableHash } from './transitions';
import { decidedMatchUpIds, projectDraw } from './transitions';
import type { PropertyFailure } from './transitions';

/**
 * Relational properties — statements about a mutation and its inverse, which no single-state
 * scanner can express.
 *
 * Each is formulated so a legitimate REFUSAL is not a violation. The engine is entitled to
 * decline a clear (PROPAGATED_EXITS_DOWNSTREAM, CANNOT_CHANGE_WINNING_SIDE); what it is not
 * entitled to do is accept one and leave residue behind. Conflating those two would make the
 * properties fire on correct behaviour, and a harness that cries wolf gets muted.
 */

/**
 * DO_UNDO_IDENTITY — applying an outcome and then clearing it must restore the prior draw.
 *
 * This is the residue detector. A cascade that writes N matchUps forward and unwinds N-1 of them
 * leaves a draw that looks fine to every state-level check and produces "impossible" states hours
 * later in a real tournament. It is also the general form of the partial-mutation class: a write
 * that errors halfway cannot be undone, so the round trip diverges.
 */
export function checkDoUndoIdentity({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const before = stableHash(projectDraw(getDrawDefinition(drawId)));

  const applied = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  // the forward mutation being refused is not this property's business — checkErrorAtomicity
  // already covers refusals, and there is nothing to undo.
  if (applied.error || applied.thrown || !applied.mutated) return [];

  const cleared = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome: clearOutcome });
  if (cleared.thrown) {
    return [{ property: 'DO_UNDO_IDENTITY', matchUpId, detail: `clear threw: ${cleared.thrown}` }];
  }
  // a refused clear is legitimate: the engine may decline to unwind a propagated exit.
  if (cleared.error) return [];

  const after = stableHash(projectDraw(getDrawDefinition(drawId)));
  if (after === before) return [];

  return [
    {
      property: 'DO_UNDO_IDENTITY',
      matchUpId,
      detail: `clear succeeded but the draw did not return to its prior state\n  ${firstDifference(before, after)}`,
    },
  ];
}

/**
 * IDEMPOTENT_REAPPLY — applying the identical outcome twice must not write twice.
 *
 * A non-idempotent mutation means a client that retries on failure corrupts progressively, which
 * is exactly what the DOUBLE_ELIMINATION defect does today.
 */
export function checkIdempotence({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const first = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  if (first.error || first.thrown || !first.mutated) return [];

  const second = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome, priorHash: first.after });
  if (!second.mutated) return [];

  return [
    {
      property: 'IDEMPOTENT_REAPPLY',
      matchUpId,
      detail: `re-applying ${JSON.stringify(outcome)} mutated the draw a second time${
        second.error ? ` and returned ${JSON.stringify(second.error)}` : ''
      }`,
    },
  ];
}

/**
 * MONOTONIC_DECISION — scoring a fresh matchUp must not un-decide a decided one.
 *
 * Advancing a participant may legitimately CHANGE a downstream status (a propagated exit
 * resolving onto whoever falls through), so the property is about the decided SET shrinking, not
 * about statuses being immutable.
 */
export function checkMonotonicity({ propagateExitStatus, matchUpId, drawId, outcome }): PropertyFailure[] {
  const before = decidedMatchUpIds(getDrawMatchUps(drawId));
  const applied = observeMutation({ propagateExitStatus, matchUpId, drawId, outcome });
  if (applied.error || applied.thrown) return [];

  const after = decidedMatchUpIds(applied.matchUps);
  const undecided = [...before].filter((id) => !after.has(id));
  if (!undecided.length) return [];

  return [
    {
      property: 'MONOTONIC_DECISION',
      matchUpId,
      detail: `scoring this matchUp un-decided ${undecided.length}: ${undecided.map((id) => id.slice(0, 8)).join(', ')}`,
    },
  ];
}

/** Locate the first divergence between two serializations, for a readable failure message. */
function firstDifference(before: string, after: string): string {
  let index = 0;
  while (index < before.length && index < after.length && before[index] === after[index]) index++;
  const window = 90;
  const start = Math.max(0, index - window / 2);
  return `at offset ${index}\n  before: …${before.slice(start, start + window)}…\n  after:  …${after.slice(start, start + window)}…`;
}

export { hash };
