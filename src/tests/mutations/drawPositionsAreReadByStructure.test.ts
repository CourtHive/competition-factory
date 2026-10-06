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
 */

const RAW_READ = /drawPositions\??\.?\[[^\]]+\]|drawPositions\??\.indexOf\(/;

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
};

function rawReads(dir: string, root: string, found: Record<string, number>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') rawReads(full, root, found);
    } else if (entry.name.endsWith('.ts')) {
      const count = fs
        .readFileSync(full, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\*|\/\/)/.test(line) && RAW_READ.test(line)).length;
      if (count) found[path.relative(root, full).split(path.sep).join('/')] = count;
    }
  }
  return found;
}

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
