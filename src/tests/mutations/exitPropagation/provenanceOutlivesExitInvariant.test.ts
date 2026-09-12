import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { expect, it } from 'vitest';

const rulesFor = (matchUp: any): string[] =>
  getInvariantViolations({ matchUps: [matchUp], drawDefinition: { structures: [] } }).map((v: any) => v.rule);

const provenance = { 1: { previousMatchUpStatus: DOUBLE_WALKOVER, sourceMatchUpId: 'source-1' } };

/**
 * `PROVENANCE_OUTLIVES_EXIT` replaces `PROVENANCE_OUTLIVES_CODES`, which was too strict.
 *
 * The old rule treated an emptied `matchUpStatusCodes` as proof the exit was gone. It is not:
 * `attemptToModifyScore` coerces an absent array to `[]`, so `[]` means either "blank them" or "the
 * caller supplied none" — and #4823 deliberately preserves provenance in the second case, on a
 * matchUp that is still an exit. The old rule fired on exactly that state and was green only because
 * no test happened to produce it.
 */

it('does NOT fire on a still-standing exit whose codes were emptied by the coercion', () => {
  // the state #4823 deliberately preserves
  expect(
    rulesFor({
      matchUpId: 'a',
      matchUpStatus: WALKOVER,
      winningSide: 1,
      matchUpStatusCodes: [],
      sideExitProvenance: provenance,
    }),
  ).not.toContain('PROVENANCE_OUTLIVES_EXIT');
  // a double exit stamps provenance, so isAnyExit must cover it — isExit alone would not
  expect(
    rulesFor({
      matchUpId: 'b',
      matchUpStatus: DOUBLE_WALKOVER,
      matchUpStatusCodes: [],
      sideExitProvenance: provenance,
    }),
  ).not.toContain('PROVENANCE_OUTLIVES_EXIT');
});

it('fires when the matchUp is no longer an exit but still carries a reason for one', () => {
  expect(
    rulesFor({ matchUpId: 'c', matchUpStatus: TO_BE_PLAYED, matchUpStatusCodes: [], sideExitProvenance: provenance }),
  ).toContain('PROVENANCE_OUTLIVES_EXIT');
});

it('stays silent when there is no provenance to outlive anything', () => {
  expect(rulesFor({ matchUpId: 'd', matchUpStatus: TO_BE_PLAYED, matchUpStatusCodes: [] })).not.toContain(
    'PROVENANCE_OUTLIVES_EXIT',
  );
});
