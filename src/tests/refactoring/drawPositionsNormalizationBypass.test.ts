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
 */

const SOURCE_ROOT = path.resolve(__dirname, '../../../src');

/** `<file>:<line>` → the reason this assignment does not need the helper */
const ALLOWED: Record<string, string> = {
  'mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant.ts':
    'ends in `.filter(Boolean)`, which compacts — an all-holes result is already `[]`. Measured over ' +
    '2,400 census seed-runs: 0 all-holes writes from this site, against 2,437 from positionClear.',
  'mutate/drawDefinitions/luckyDrawAdvancement.ts':
    'writes `[]` or a freshly minted `[pos1, pos2]` from `nextPosition++` — no removal, no substitution.',
  'mutate/drawDefinitions/pruneDrawDefinition.ts':
    'RENUMBERS through a map built from exactly these matchUps’ own truthy positions, so every ' +
    'truthy entry resolves and a hole stays a hole. It cannot turn a non-all-holes array into one.',
  'mutate/drawDefinitions/resetDrawDefinition.ts':
    'line 198 writes `[]` outright; the removal branch below it routes through the helper.',
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
    (site) => !site.text.includes('normalizeDrawPositions(') && !(site.relative in ALLOWED),
  );

  expect(bypasses.map((site) => `${site.relative}:${site.line}  ${site.text}`)).toEqual([]);

  // and the list can only shrink: an allowlist entry naming a file with no assignment left is stale
  const filesWithAssignments = new Set(sites.map((site) => site.relative));
  const stale = Object.keys(ALLOWED).filter((relative) => !filesWithAssignments.has(relative));
  expect(stale).toEqual([]);
});
