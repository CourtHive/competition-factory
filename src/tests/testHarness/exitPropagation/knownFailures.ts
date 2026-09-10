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

const DOUBLE_EXIT_PARTIAL_MUTATION =
  'DOUBLE_ELIMINATION double exit: setMatchUpStatus returns ERR_EXISTING_POSITION_ASSIGNMENT after ' +
  'writing four structures (backdraw final, main final, a BYE into the Decider, and a position ' +
  'assignment), and the call is not idempotent — a retry errors AND mutates again. On master the ' +
  'same sequence throws the #4779 TypeError instead, so #4779 converted the crash into a clean ' +
  'error code at one of ~12 failure paths downstream of the first write; the partial mutation is ' +
  'untouched. See Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md §4.';

const DOUBLE_EXIT_DRAWPOSITION_RESIDUE =
  'DOUBLE_ELIMINATION 8/7: apply-then-clear leaves a Main matchUp with its drawPositions REMOVED — ' +
  '[1, null] before, absent after. The apply does not touch that matchUp at all (measured), so the ' +
  'clear over-removes: it strips a drawPosition the cascade never placed. Distinct from the ' +
  'matchUp-status residue fixed by consulting positionAssignment.bye in removeDoubleExit, and from ' +
  'the matchUpStatusCodes residue below. DECIDED (2026-09-09, CA): the unwind will RE-DERIVE the ' +
  'correct value from current state rather than blanking it, and no source identity is added to the ' +
  'schema. Not yet implemented. See Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md, E1.';

const DOUBLE_EXIT_STATUS_CODES_RESIDUE =
  'FIRST_ROUND_LOSER_CONSOLATION: apply-then-clear wipes matchUpStatusCodes that were present ' +
  'BEFORE the double exit. The matchUp carried [WALKOVER/prev DOUBLE_WALKOVER side 1, ' +
  'TO_BE_PLAYED side 2]; the apply escalated it to DOUBLE_WALKOVER with both sides WALKOVER; the ' +
  'clear then writes matchUpStatusCodes: [] unconditionally rather than restoring the codes that ' +
  'pre-dated the cascade. matchUpStatus itself is restored correctly — only the provenance is lost, ' +
  'so exitProducedByPropagation reads false for a matchUp that IS propagation-produced. Same ' +
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
 * The DO_UNDO_IDENTITY list was 9 cells and is now 3. Diffing the round trip structurally showed
 * the residue was never ONE mechanism: 6 cells lost a matchUp's BYE status (fixed — removeDoubleExit
 * now reads positionAssignment.bye rather than a matchUpStatus the cascade has already overwritten),
 * 1 loses drawPositions and 2 lose matchUpStatusCodes. Each survivor carries its own reference.
 */
const DOUBLE_EXIT_PROPERTY_CELLS: [string, string[], string][] = [
  ['DOUBLE_ELIMINATION 8/7', ['DO_UNDO_IDENTITY'], DOUBLE_EXIT_DRAWPOSITION_RESIDUE],
  ['FIRST_ROUND_LOSER_CONSOLATION 8/8', ['DO_UNDO_IDENTITY'], DOUBLE_EXIT_STATUS_CODES_RESIDUE],
  ['FIRST_ROUND_LOSER_CONSOLATION 16/16', ['DO_UNDO_IDENTITY'], DOUBLE_EXIT_STATUS_CODES_RESIDUE],
];

const ACTION_MUTATION_DISAGREEMENT =
  'matchUpActions offers SCORE on a decided matchUp, but clearing that matchUp is refused with ' +
  'ERR_PROPAGATED_EXITS_DOWNSTREAM — so the UI presents a control the engine rejects when used. ' +
  'Root cause is a verified single-line divergence: setMatchUpState gates the clear on BOTH ' +
  'hasPropagatedExitDownstream and isActiveDownstream (setMatchUpState.ts:189-195), while ' +
  'matchUpActions consults isActiveDownstream alone (matchUpActions.ts:272,284). 64 instances ' +
  'across 7 draw types, single WALKOVER only. Nothing throws and no state is corrupted, which is ' +
  'why no crash-or-consistency oracle would surface it. Fix is to give matchUpActions the same ' +
  'gate; see Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md §5 phase 2.';

/** Cells where matchUpActions and setMatchUpStatus disagree, as drawType + size/participants. */
const ACTION_DISAGREEMENT_CELLS = [
  'DOUBLE_ELIMINATION 8/8',
  'DOUBLE_ELIMINATION 8/7',
  'DOUBLE_ELIMINATION 16/16',
  'DOUBLE_ELIMINATION 16/15',
  'FIRST_MATCH_LOSER_CONSOLATION 8/7',
  'FIRST_MATCH_LOSER_CONSOLATION 16/15',
  'FIRST_ROUND_LOSER_CONSOLATION 8/7',
  'FIRST_ROUND_LOSER_CONSOLATION 16/15',
  'FEED_IN_CHAMPIONSHIP 8/7',
  'FEED_IN_CHAMPIONSHIP 16/15',
  'CURTIS_CONSOLATION 8/8',
  'CURTIS_CONSOLATION 16/15',
  'COMPASS 8/8',
  'COMPASS 8/7',
  'COMPASS 16/16',
  'COMPASS 16/15',
  'OLYMPIC 8/8',
  'OLYMPIC 8/7',
  'OLYMPIC 16/16',
  'OLYMPIC 16/15',
];

const doubleEliminationCell = (drawSize: number, exitStatus: string, propagate: boolean) =>
  `matrix DOUBLE_ELIMINATION ${drawSize}/${drawSize} ${exitStatus} propagate=${propagate}`;

export const KNOWN_FAILURES: QuarantineEntry[] = [
  ...['DOUBLE_WALKOVER', 'DOUBLE_DEFAULT'].flatMap((exitStatus) =>
    [true, false].map((propagate) => ({
      key: doubleEliminationCell(8, exitStatus, propagate),
      properties: ['ERROR_IMPLIES_NO_MUTATION'],
      reference: DOUBLE_EXIT_PARTIAL_MUTATION,
    })),
  ),
  ...ACTION_DISAGREEMENT_CELLS.map((cell) => ({
    key: `agreement ${cell} WALKOVER`,
    properties: ['ACTION_MUTATION_AGREEMENT'],
    reference: ACTION_MUTATION_DISAGREEMENT,
  })),
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
