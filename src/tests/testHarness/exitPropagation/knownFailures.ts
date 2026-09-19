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

/**
 * Cells failing the relational properties — **currently none**.
 *
 * Entries are listed explicitly rather than derived: the point of the registry is that adding one is
 * a deliberate act with a reference attached, and a pattern-matched rule would silently absorb new
 * failures as the matrix grows. An entry has the shape
 * `{ key: 'properties <drawType> <size>/<participants> <exitStatus>', properties, reference }`.
 *
 * IDEMPOTENT_REAPPLY was removed from every cell that carried it when the idempotence guard landed
 * in `attemptToSetMatchUpStatus` — 14 entries, deleted because the reverse guard demanded it.
 *
 * The DO_UNDO_IDENTITY list was 9 cells, then 2, and is now **EMPTY**. Diffing the round trip
 * structurally showed the residue was never ONE mechanism: 6 cells lost a matchUp's BYE status
 * (fixed — `removeDoubleExit` reads `positionAssignment.bye` rather than a `matchUpStatus` the
 * cascade has already overwritten), 1 lost drawPositions (closed 2026-09-17; `removeDoubleExit` was
 * intersecting drawPosition NUMBERS across the `Backdraw r4 -> Main r4` and `Main r4 -> Decider r1`
 * links, and now asks by participant — see `removeLinkedWinner`), and 2 lost `matchUpStatusCodes`.
 *
 * THE LAST TWO CLOSED 2026-09-19, and they closed the way the entry said they would. Their
 * reference recorded CA's decision of 2026-09-09: *"RE-DERIVE the codes on unwind from the current
 * upstream state instead of writing []"*. `removeDoubleExit`'s unwind now does exactly that — it
 * retains the provenance whose origin is not going away and projects the codes from it, instead of
 * writing `matchUpStatusCodes: []` over a matchUp that is still an exit. FIRST_ROUND_LOSER_CONSOLATION
 * 8/8 and 16/16 stopped reproducing under both DOUBLE_WALKOVER and DOUBLE_DEFAULT, and this registry
 * enforces its list in BOTH directions, so their removal is required rather than optional.
 *
 * **The property was not weakened to get here.** Nothing in `properties.ts` or
 * `transitionProperties.test.ts` changed; the engine stopped violating it.
 */
/**
 * KEYED rather than a list, so a key cannot be registered twice and adding one is a single line:
 *
 * ```ts
 * 'properties DOUBLE_ELIMINATION 16/16 DOUBLE_WALKOVER': {
 *   properties: ['DO_UNDO_IDENTITY'],
 *   reference: 'what is broken, and where it is tracked',
 * },
 * ```
 */
const QUARANTINE: Record<string, Omit<QuarantineEntry, 'key'>> = {};

export const KNOWN_FAILURES: QuarantineEntry[] = Object.entries(QUARANTINE).map(([key, entry]) => ({
  key,
  ...entry,
}));

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
