import { isProjectedExitCode } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * `matchUpStatusCodes` has TWO TENANTS, and P37 evicts one of them.
 *
 * CA, 2026-09-27: *"I'm not sure that finding full resolution on the matchUpStatusCodes is a goal
 * since Provenance gives us clear detail that is side based and consumers should switch to provenance
 * detail. We don't want to be relying on the old matchUpStatusCodes array order and work around
 * derivations for the long term."*
 *
 * So the destination is one tenant fewer, not a better array. What stays is the POLICY vocabulary —
 * `POLICY_SCORING_USTA`'s `W1`, `DEF`, `DQ` — which belongs to the match and lands on the exiting
 * side. What leaves is exit provenance, whose side identity belongs in `sideExitProvenance` because
 * that field is side-KEYED while the array is positional.
 *
 * Every eviction site needs the same question answered — *"is this element the exit tenant?"* — and a
 * filter written inline at each site is how the two tenants got confused to begin with. This pins the
 * one predicate, including the deliberate asymmetry in it.
 */

it('distinguishes the EXIT tenant from the POLICY tenant of matchUpStatusCodes', () => {
  // THE EXIT TENANT — the projected shape, and the reserved slot that stands in for a side whose
  // origin is not known yet. The stub is not noise: `updateMatchUpStatusCodes` learns a side's origin
  // late and stamps by mapping over elements that already exist.
  expect(isProjectedExitCode({ previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sideNumber: 1 })).toBe(
    true,
  );
  expect(isProjectedExitCode({ previousMatchUpStatus: DOUBLE_WALKOVER, sideNumber: 2 })).toBe(true);
  expect(isProjectedExitCode({ sideNumber: 1 })).toBe(true);

  // THE POLICY TENANT — survives. Both the raw vocabulary and the `{ code }` wrapper that
  // `updateMatchUpStatusCodes` puts around a string before stamping onto it.
  expect(isProjectedExitCode({ matchUpStatusCode: 'W1', label: 'Walkover', matchUpStatusCodeDisplay: 'W.O.' })).toBe(
    false,
  );
  expect(isProjectedExitCode({ code: 'DEF' })).toBe(false);

  // A BARE STRING reads as POLICY, i.e. it survives, and the asymmetry is deliberate rather than
  // overlooked. Strings are genuinely ambiguous — the exit tenant was once written as a bare string by
  // `applyPositionToMatchUp` — and where the ambiguity is theoretical the conservative reading is the
  // one that does not destroy a code. Measured at that site over the exit-propagation and
  // matchUpStatus suites (2026-09-27, 113 arrivals): no string ever reaches it.
  expect(isProjectedExitCode('DEF')).toBe(false);
  expect(isProjectedExitCode('')).toBe(false);

  // A POLICY code that ALSO carries a sideNumber stays policy. The presence of a real code is the
  // stronger signal, and reading it as the exit tenant would delete a code the scoring policy owns.
  expect(isProjectedExitCode({ matchUpStatusCode: 'W1', sideNumber: 2 })).toBe(false);

  // NEITHER — nothing to classify, and nothing to remove.
  expect(isProjectedExitCode(undefined)).toBe(false);
  expect(isProjectedExitCode({})).toBe(false);
});
