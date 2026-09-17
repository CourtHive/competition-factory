/**
 * Quarantine registry for exit-propagation properties that are known to be violated today.
 *
 * This is deliberately NOT a "warn-only" mode. A warning that nobody has to act on is muted
 * within weeks, and then the harness is dead weight. Instead every known failure is named
 * exactly, and the matrix enforces the list in BOTH directions:
 *
 *   - a NEW failure in any cell fails the run, and
 *   - a quarantined failure that stops reproducing ALSO fails the run, with instructions to
 *     delete the entry.
 *
 * So the list can only shrink, and it cannot rot: `unusedQuarantineKeys` fails the run if an
 * entry names a cell the matrix no longer produces.
 *
 * Every entry must carry a tracking reference. An entry with no reference is a bug someone
 * decided to live with silently, which is the thing this file exists to prevent.
 */

export type QuarantineEntry = {
  /** cell label, exactly as the matrix composes it */
  key: string;
  /** property names expected to fail for this cell */
  properties: string[];
  /** why this is not fixed yet, and where it is tracked */
  reference: string;
};

const DOUBLE_EXIT_STATUS_CODES_RESIDUE =
  'FIRST_ROUND_LOSER_CONSOLATION: apply-then-clear wipes matchUpStatusCodes that were present ' +
  'BEFORE the double exit. The matchUp carried [WALKOVER/prev DOUBLE_WALKOVER side 1, ' +
  'TO_BE_PLAYED side 2]; the apply escalated it to DOUBLE_WALKOVER with both sides WALKOVER; the ' +
  'clear then writes matchUpStatusCodes: [] unconditionally rather than restoring the codes that ' +
  'pre-dated the cascade. matchUpStatus itself is restored correctly — only the provenance is lost, ' +
  'so isPropagatedExit reads false for a matchUp that IS propagation-produced. Same ' +
  'family as the hard-coded empty codes in advanceByeAdvancedDrawPosition. DECIDED (2026-09-09, CA): ' +
  'RE-DERIVE the codes on unwind from the current upstream state instead of writing []. Source ' +
  'identity is deliberately NOT added to matchUpStatusCodes — they are published on every matchUp, ' +
  'so the published surface stays fixed. Not yet implemented. See ' +
  'Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md, E1.';

/**
 * Cells failing the relational properties, as [cell-without-status, properties].
 *
 * Listed explicitly rather than derived: the point of the registry is that adding a cell is a
 * deliberate act with a reference attached, and a pattern-matched rule would silently absorb new
 * failures as the matrix grows.
 *
 * IDEMPOTENT_REAPPLY was removed from every cell that carried it when the idempotence guard landed
 * in `attemptToSetMatchUpStatus` — 14 entries, deleted because the reverse guard demanded it.
 *
 * The DO_UNDO_IDENTITY list was 9 cells and is now 2. Diffing the round trip structurally showed
 * the residue was never ONE mechanism: 6 cells lost a matchUp's BYE status (fixed — removeDoubleExit
 * now reads positionAssignment.bye rather than a matchUpStatus the cascade has already overwritten),
 * 1 lost drawPositions and 2 lose matchUpStatusCodes. Each survivor carries its own reference.
 *
 * The drawPositions cell (DOUBLE_ELIMINATION 8/7) closed 2026-09-17. Its clear "stripped a drawPosition
 * the cascade never placed" because removeDoubleExit intersected drawPosition NUMBERS across the
 * `Backdraw r4 -> Main r4` and `Main r4 -> Decider r1` links — a Backdraw position matching an
 * unrelated Main one. It now asks by participant; see `removeLinkedWinner`.
 */
const DOUBLE_EXIT_PROPERTY_CELLS: [string, string[], string][] = [
  ['FIRST_ROUND_LOSER_CONSOLATION 8/8', ['DO_UNDO_IDENTITY'], DOUBLE_EXIT_STATUS_CODES_RESIDUE],
  ['FIRST_ROUND_LOSER_CONSOLATION 16/16', ['DO_UNDO_IDENTITY'], DOUBLE_EXIT_STATUS_CODES_RESIDUE],
];

export const KNOWN_FAILURES: QuarantineEntry[] = [
  ...DOUBLE_EXIT_PROPERTY_CELLS.flatMap(([cell, properties, reference]) =>
    ['DOUBLE_WALKOVER', 'DOUBLE_DEFAULT'].map((exitStatus) => ({
      key: `properties ${cell} ${exitStatus}`,
      properties: properties as string[],
      reference: reference as string,
    })),
  ),
];

export function quarantineFor(key: string): string[] {
  return KNOWN_FAILURES.filter((entry) => entry.key === key).flatMap((entry) => entry.properties);
}

/**
 * Quarantine keys that no cell produced — stale entries.
 *
 * Scoped by prefix because the registry is shared across suites: without it each suite would
 * report the other suite's keys as stale.
 */
export function unusedQuarantineKeys(observedKeys: Set<string>, prefix: string): string[] {
  return KNOWN_FAILURES.map((entry) => entry.key)
    .filter((key) => key.startsWith(prefix) && !observedKeys.has(key))
    .sort((a, b) => a.localeCompare(b));
}
