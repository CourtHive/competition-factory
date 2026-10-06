import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * A MATCHUP'S `drawPositions` IS READ BY STRUCTURE, NOT BY INDEX, OR IS LISTED HERE WITH WHY NOT.
 *
 * Step 1 of `Mentat/planning/LEADING_HOLE_REMOVAL_DESIGN.md` (CA, 2026-10-06). A lone position is stored at index 0
 * whatever its side once the leading hole is gone (`[5]`, not `[undefined, 5]`), so `drawPositions[side - 1]`,
 * `indexOf(position) + 1` and `[index]` by roundPosition misread it. The side helpers in `getDrawPositionSides.ts`
 * (`getSideDrawPosition`, `getDrawPositionSideNumber`, `getWinningSideDrawPosition`) resolve a lone position through
 * the round profile and answer the same for both shapes. Every reader is moved onto them before the writers stop
 * building the hole (step 2), so the draw does not change in between.
 *
 * So the raw reads left in `src` are an EXACT list. A new one fails this test until it uses a helper, or is added below
 * with the reason it cannot misread a lone position.
 *
 * ## The forms a read takes
 *
 * The first version of this guard matched only an identifier ENDING in `drawPositions` directly before `[` or
 * `.indexOf(`, and was green on a tree holding three raw side reads it could not see: `(x.drawPositions ?? [])[i]`,
 * `(x.drawPositions ?? []).indexOf(…)` and a local alias, `const claimPositions = x.drawPositions ?? []` read by
 * `claimPositions.indexOf(…)`. A CamelCase alias such as `targetMatchUpDrawPositions[i]` — the form the design table
 * lists for `directLoser` and `drawPositionPlacement` — was invisible too. The matcher below sees all four, and the
 * self-test plants each one so the blind spot cannot come back.
 */

/** a subscript on something NAMED drawPositions, `drawPositions[…]`, `?.[…]`, `targetMatchUpDrawPositions[…]` */
const NAMED_SUBSCRIPT = /\b\w*[dD]rawPositions(\?\.)?\[(?!\])/g;
/** `(x.drawPositions ?? [])[i]` */
const DEFAULTED_SUBSCRIPT = /[dD]rawPositions\s*(\?\?|\|\|)\s*\[\]\)\s*(\?\.)?\[/g;
/** `drawPositions.indexOf(…)`, `(x.drawPositions ?? []).indexOf(…)` */
const INDEX_OF = /[dD]rawPositions(\s*(\?\?|\|\|)\s*\[\]\))?\??\.indexOf\(/g;
/** `const claimPositions = matchUp.drawPositions ?? [];` — a local alias of the RAW array, read below by name */
const RAW_ALIAS =
  /\b(?:const|let|var)\s+(\w+)(?:\s*:[^=]+)?\s*=\s*\(?[\w?.]+\.drawPositions\s*(?:(?:\?\?|\|\|)\s*\[\])?\s*\)?\s*;/g;

const ALLOWED: Record<string, { count: number; why: string }> = {
  'query/matchUps/getDrawPositionSides.ts': {
    count: 3,
    why: 'the helpers themselves: each indexes only once both positions are present',
  },
  'mutate/matchUps/drawPositions/removeOnwardLoserPlacements.ts': {
    count: 1,
    why: 'guarded: indexes only when both positions are present',
  },
  'query/participants/getParticipantEntries.ts': {
    count: 1,
    why: 'a different `drawPositions`: a map keyed by participantId, not a matchUp array',
  },
  'mutate/drawDefinitions/positionGovernor/doubleExitAdvancement.ts': {
    count: 2,
    why:
      'safe: `targetMatchUpDrawPositions` is a `.filter(Boolean)` copy, indexed by side only when both are present ' +
      "and read at `[0]` as the lone position otherwise. (The cascade's exiting side and the bye claim's side, which " +
      'did misread, now read structurally.)',
  },
  'mutate/matchUps/drawPositions/directLoser.ts': {
    count: 1,
    why:
      '`availableTargetMatchUpDrawPositions[0]` is not a matchUp array: it is built from positionAssignments ' +
      'filtered to unfilled seats, and `[0]` is the first such seat',
  },
  'mutate/matchUps/drawPositions/positionQualifiers.ts': {
    count: 2,
    why: '`roundDrawPositions[roundNumber]` is a map from roundNumber to positions, not a matchUp array',
  },
  'query/matchUps/getDrawPositionsRanges.ts': {
    count: 1,
    why: '`possibleDrawPositions[index]` is a per-roundPosition list of candidate ranges, not a matchUp array',
  },
  'query/matchUps/getRoundMatchUps.ts': {
    count: 1,
    why:
      '`filteredDrawPositions[0]` reads a COMPACTED copy holding one position, placed on side 1 BECAUSE the round ' +
      'is a feed round (the structural test): a side resolver, not a side reader',
  },
  'query/matchUps/addMatchUpContext.ts': {
    count: 1,
    why:
      '`orderedDrawPositions[0]` reads the output of `getOrderedDrawPositions`, positional by construction: its ' +
      'index IS the side, resolved structurally',
  },
};

const countOf = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

/** comment lines and trailing comments carry the idioms as prose, and are not reads */
const codeLines = (source: string) =>
  source.split('\n').map((line) => (/^\s*(\*|\/\/|\/\*)/.test(line) ? '' : line.replace(/\s\/\/.*$/, '')));

function rawReadCount(source: string): number {
  const lines = codeLines(source);
  const aliases = [...lines.join('\n').matchAll(RAW_ALIAS)]
    .map((match) => match[1])
    .filter((name) => !/[dD]rawPositions$/.test(name));
  const aliasPatterns = aliases.flatMap((name) => [
    new RegExp(String.raw`\b${name}(\?\.)?\[(?!\])`, 'g'),
    new RegExp(String.raw`\b${name}\??\.indexOf\(`, 'g'),
  ]);
  return lines.reduce(
    (sum, text) =>
      sum +
      countOf(text, NAMED_SUBSCRIPT) +
      countOf(text, DEFAULTED_SUBSCRIPT) +
      countOf(text, INDEX_OF) +
      aliasPatterns.reduce((inner, pattern) => inner + countOf(text, pattern), 0),
    0,
  );
}

function rawReads(dir: string, root: string, found: Record<string, number>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') rawReads(full, root, found);
    } else if (entry.name.endsWith('.ts')) {
      const count = rawReadCount(fs.readFileSync(full, 'utf8'));
      if (count) found[path.relative(root, full).split(path.sep).join('/')] = count;
    }
  }
  return found;
}

it('the matcher sees every form a raw read takes, and nothing in prose', () => {
  // the plants: each of these was once invisible to this guard
  const reads = [
    'const a = drawPositions[sideNumber - 1];',
    'const b = matchUp.drawPositions?.[winningSide - 1];',
    'const c = (matchUp.drawPositions ?? [])[side - 1];',
    'const d = matchUp.drawPositions.indexOf(drawPosition) + 1;',
    'const e = (raw.drawPositions ?? []).indexOf(drawPosition) + 1;',
    'const f = targetMatchUpDrawPositions[index];',
    'const claimPositions = matchUp.drawPositions ?? [];',
    'const g = claimPositions.indexOf(drawPosition);',
  ];
  expect(rawReadCount(reads.join('\n'))).toEqual(7);

  const prose = [
    '// drawPositions[winningSide - 1] in a comment',
    ' * `indexOf(drawPosition) + 1` in a doc block',
    'const h: number[] = matchUp.drawPositions?.filter(Boolean) ?? []; // not drawPositions[0]',
    'type T = { drawPositions: number[] };',
    'const filtered = matchUp.drawPositions?.filter(Boolean);',
    'const i = filtered[0];',
  ];
  expect(rawReadCount(prose.join('\n'))).toEqual(0);
});

it('every raw drawPositions read in src is a side helper or a listed exception', () => {
  const root = path.resolve(__dirname, '../..');
  const found = rawReads(root, root, {});
  // CONTROL: the scan reads what it says it reads; the helpers themselves are found
  expect(found['query/matchUps/getDrawPositionSides.ts']).toEqual(3);

  const expected = Object.fromEntries(Object.entries(ALLOWED).map(([file, { count }]) => [file, count]));
  expect(found, 'read the side through getDrawPositionSides, or list the read with why it cannot misread').toEqual(
    expected,
  );
});
