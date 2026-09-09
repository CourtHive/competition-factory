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

const DOUBLE_EXIT_DROPPED_PROGRESSION =
  'DOUBLE_ELIMINATION double exit at drawSize 16: getDrawInconsistencies reports DROPPED_PROGRESSION ' +
  '— a loser eligible to feed the linked target structure is absent from it. Found by this matrix, ' +
  'not previously recorded. Same draw type and status class as the drawSize-8 entries above, so ' +
  'likely the same root cause surfacing later in the cascade. See ' +
  'Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md §7.';

const DOUBLE_EXIT_NOT_REVERSIBLE =
  'Applying a double exit is neither reversible nor idempotent. DO_UNDO_IDENTITY: after apply-then-' +
  'clear, a matchUp that was BYE before the double walkover comes back TO_BE_PLAYED — the removal ' +
  'path cannot distinguish a BYE it created (setMatchUpStatus.md rule 2) from one that already ' +
  'existed, so it over-clears. IDEMPOTENT_REAPPLY: re-applying the identical double exit mutates ' +
  'the draw a second time. Consistent with the add and remove paths using different pairing ' +
  'arithmetic (getPairedPreviousMatchUpIsDoubleExit anchors on roundNumber-1, getPairedPreviousMatchUp ' +
  'on roundNumber) and with removeDoubleExit having no iteration bound. Every failing cell is a ' +
  'double exit and the two statuses fail identically in each — a systematic defect, not noise. See ' +
  'Mentat/planning/EXIT_PROPAGATION_ASSESSMENT.md §3 class B.';

/**
 * Cells failing the relational properties, as [cell-without-status, properties].
 *
 * Listed explicitly rather than derived: the point of the registry is that adding a cell is a
 * deliberate act with a reference attached, and a pattern-matched rule would silently absorb new
 * failures as the matrix grows.
 */
const DOUBLE_EXIT_PROPERTY_CELLS: [string, string[]][] = [
  ['SINGLE_ELIMINATION 16/15', ['IDEMPOTENT_REAPPLY']],
  ['DOUBLE_ELIMINATION 8/8', ['IDEMPOTENT_REAPPLY']],
  ['DOUBLE_ELIMINATION 8/7', ['DO_UNDO_IDENTITY']],
  ['DOUBLE_ELIMINATION 16/15', ['IDEMPOTENT_REAPPLY']],
  ['FIRST_MATCH_LOSER_CONSOLATION 8/8', ['DO_UNDO_IDENTITY']],
  ['FIRST_MATCH_LOSER_CONSOLATION 16/16', ['DO_UNDO_IDENTITY']],
  ['FIRST_MATCH_LOSER_CONSOLATION 16/15', ['DO_UNDO_IDENTITY']],
  ['FIRST_ROUND_LOSER_CONSOLATION 8/8', ['IDEMPOTENT_REAPPLY', 'DO_UNDO_IDENTITY']],
  ['FIRST_ROUND_LOSER_CONSOLATION 16/16', ['IDEMPOTENT_REAPPLY', 'DO_UNDO_IDENTITY']],
  ['MODIFIED_FEED_IN_CHAMPIONSHIP 16/15', ['DO_UNDO_IDENTITY']],
  ['FEED_IN_CHAMPIONSHIP 16/15', ['DO_UNDO_IDENTITY']],
  ['CURTIS_CONSOLATION 16/15', ['DO_UNDO_IDENTITY']],
  ['COMPASS 16/15', ['IDEMPOTENT_REAPPLY']],
  ['OLYMPIC 16/15', ['IDEMPOTENT_REAPPLY']],
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
  ...['DOUBLE_WALKOVER', 'DOUBLE_DEFAULT'].flatMap((exitStatus) =>
    [true, false].map((propagate) => ({
      key: doubleEliminationCell(16, exitStatus, propagate),
      properties: ['DRAW_INCONSISTENCY'],
      reference: DOUBLE_EXIT_DROPPED_PROGRESSION,
    })),
  ),
  ...ACTION_DISAGREEMENT_CELLS.map((cell) => ({
    key: `agreement ${cell} WALKOVER`,
    properties: ['ACTION_MUTATION_AGREEMENT'],
    reference: ACTION_MUTATION_DISAGREEMENT,
  })),
  ...DOUBLE_EXIT_PROPERTY_CELLS.flatMap(([cell, properties]) =>
    ['DOUBLE_WALKOVER', 'DOUBLE_DEFAULT'].map((exitStatus) => ({
      key: `properties ${cell} ${exitStatus}`,
      properties: properties as string[],
      reference: DOUBLE_EXIT_NOT_REVERSIBLE,
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
