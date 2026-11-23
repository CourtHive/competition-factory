import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Every writer that REMOVES or SUBSTITUTES a `matchUp.drawPositions` entry routes through
 * `normalizeDrawPositions`. A repo-wide scan, because the alternative has already failed here.
 *
 * Three separate writers produced an array of nothing but holes, and each was found by a separate
 * measurement rather than by reading — `positionClear` and `releaseAdvancedDrawPosition` by a census
 * replay, `swapWinnerLoser` only after the first two were fixed and one seed in 2,400 survived. A
 * fix applied per-module is a fix that comes undone in the next module, so the rule is enforced
 * statically rather than remembered.
 *
 * Scope: ASSIGNMENTS of the form `<something>.drawPositions = …`. Object-literal construction at
 * generation time is a different act with a different rule — a generated matchUp holds no position
 * yet and writes `[]` — and is pinned by `drawPositionsHydrationContract.test.ts` instead.
 *
 * Adding a site? Route it through the helper. Allowlist it ONLY if it cannot produce an all-holes
 * array, and say why in the entry — the reason is the point of the list.
 *
 * ## `removeSubsequentRoundsParticipant` COMPACTS, and that was measured before being accepted
 *
 * Its `.filter(Boolean)` closes a MIXED array as well as an all-holes one, so `[undefined, 5]`
 * becomes `[5]` — which reads as a contradiction of the positional rule `getOrderedDrawPositions`
 * states under its "DO NOT CHANGE" banner. It is not a contradiction, and the only way to know that
 * was to build the alternative and measure it.
 *
 * The site compacts **1,944 times in 11,831 calls across 2,400 census seed-runs (756 distinct
 * seeds)**, every one of them `[a, b] -> [null, b] -> [b]`. Replacing it with the hole-preserving
 * form and re-running everything:
 *
 * | measurement | result |
 * |---|---|
 * | census, both windows both arms, as seed sets | 0 closed, 0 opened — no defect either way |
 * | committed suite | **3 tests RED**, two of them `DO_UNDO_IDENTITY` |
 * | consumer-visible digest, 2,212,980 matchUp readings | 6 arm-seeds where the DRAW genuinely differs, with no oracle saying which is right |
 *
 * The do/undo failures are the decisive ones. A round trip turned `[4, null]` into `[null, 4]` —
 * the occupant moved from side 1 to side 2 — because an arriving LOWER position sorts ahead of 4
 * and, when it departs again, the hole is left at index 0. Compaction erases an index that carries
 * no information for a lone occupant, and the round trip is stable; preserving the hole records the
 * arbitrary index and breaks it.
 *
 * And `[undefined, N]` is the one form that is independently unsafe: on a FEED ROUND it used to
 * hydrate with both sides empty (`getOrderedDrawPositions`, fixed alongside this note), which is
 * precisely where this writer's compactions are concentrated.
 *
 * **So the compaction stays.** Do not "fix" it without redoing this measurement.
 */

const SOURCE_ROOT = path.resolve(__dirname, '../../../src');

/**
 * An assignment that CONSTRUCTS a literal array — `= []`, `= [pos1, pos2]` — is not a removal or a
 * substitution, so it needs no helper. Recognised by shape rather than by filename, because a
 * file-level exemption also exempts every OTHER assignment in that file.
 *
 * That is not hypothetical: `resetDrawDefinition.ts` was allowlisted for its `= []` line, and the
 * exemption silently covered the removal branch below it too — deleting that file's
 * `normalizeDrawPositions` call left this guard green. Measured 2026-09-17, fixed by this rule.
 */
const CONSTRUCTS_A_LITERAL = /=\s*\[[\w\s,]*\]\s*(as\s+[\w[\]]+\s*)?;/;

/** `<file>` → the reason its TRANSFORMING assignments do not route through the helper */
const ALLOWED: Record<string, string> = {
  'mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant.ts':
    'ends in `.filter(Boolean)`, which compacts — an all-holes result is already `[]`. Measured over ' +
    '2,400 census seed-runs: 0 all-holes writes from this site, against 2,437 from positionClear. ' +
    'The COMPACTION was then measured on its own and DELIBERATELY KEPT — see the note below.',
  'mutate/drawDefinitions/pruneDrawDefinition.ts':
    'RENUMBERS through a map built from exactly these matchUps’ own truthy positions, so every ' +
    'truthy entry resolves and a hole stays a hole. It cannot turn a non-all-holes array into one.',
  'query/matchUps/getRoundMatchUps.ts':
    'writes `roundProfile[roundNumber].drawPositions`, a derived query aggregate — not a matchUp.',
};

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests') continue;
      sourceFiles(full, collected);
    } else if (entry.name.endsWith('.ts')) {
      collected.push(full);
    }
  }
  return collected;
}

const ASSIGNMENT = /(^|[^\w.])[\w?.[\]]*\.drawPositions\s*=[^=]/;

function findAssignments(files: string[]) {
  const sites: { relative: string; line: number; text: string }[] = [];
  for (const file of files) {
    const relative = path.relative(SOURCE_ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const [index, text] of lines.entries()) {
      if (ASSIGNMENT.test(text)) sites.push({ relative, line: index + 1, text: text.trim() });
    }
  }
  return sites;
}

it('every drawPositions assignment routes through normalizeDrawPositions, or is allowlisted with a reason', () => {
  const files = sourceFiles(SOURCE_ROOT);

  // the control: a scan over an empty file list would report a clean bypass sweep
  expect(files.length).toBeGreaterThan(500);

  const sites = findAssignments(files);
  expect(sites.length).toBeGreaterThan(5);

  const bypasses = sites.filter(
    (site) =>
      !site.text.includes('normalizeDrawPositions(') &&
      !CONSTRUCTS_A_LITERAL.test(site.text) &&
      !(site.relative in ALLOWED),
  );

  expect(bypasses.map((site) => `${site.relative}:${site.line}  ${site.text}`)).toEqual([]);

  // and the list can only shrink: an allowlist entry naming a file with no TRANSFORMING assignment
  // left is stale — a file whose every site now constructs a literal no longer needs an exemption
  const filesNeedingExemption = new Set(
    sites
      .filter((site) => !site.text.includes('normalizeDrawPositions(') && !CONSTRUCTS_A_LITERAL.test(site.text))
      .map((site) => site.relative),
  );
  const stale = Object.keys(ALLOWED).filter((relative) => !filesNeedingExemption.has(relative));
  expect(stale).toEqual([]);
});
