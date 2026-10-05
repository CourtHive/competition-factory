import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * EVERY WRITE OF A MATCHUP'S `drawPositions` GOES THROUGH `setMatchUpDrawPositions`, OR IS LISTED HERE WITH WHY NOT.
 *
 * Writing `drawPositions` can move the participant who stays to the other side (a lone position sits on its bracket
 * side, two sort ascending), and everything a matchUp records by side has to move with them: `sideExitProvenance`,
 * `sideStatusCodes`, the positional `matchUpStatusCodes`, `winningSide`. `setMatchUpDrawPositions` (or its re-keying
 * half, `rekeySideFacts`) does that. A writer that bypasses it re-opens the class silently: the census found the
 * keys stale eight times in 1,800 seeds before it existed (CA, 2026-10-05: option R).
 *
 * So the direct writers in `src/mutate` are an EXACT list. A new one fails this test until it is routed through the
 * setter or added below with the reason it cannot move a participant between sides.
 */

const WRITE = /\.drawPositions = |drawPositions: normalizeDrawPositions\(/;

const ALLOWED: Record<string, { count: number; why: string }> = {
  'mutate/matchUps/drawPositions/setMatchUpDrawPositions.ts': { count: 1, why: 'the setter itself' },
  'mutate/matchUps/drawPositions/drawPositionPlacement.ts': {
    count: 1,
    why: 'the arrival: `rekeySideFacts` runs first, then the Object.assign that also sets winningSide',
  },
  'mutate/matchUps/drawPositions/assignDrawPositionBye.ts': {
    count: 3,
    why: 'two BYE-path arrivals call `rekeySideFacts` first; the third places into a matchUp holding no position',
  },
  'mutate/matchUps/drawPositions/removeSubsequentRoundsParticipant.ts': {
    count: 1,
    why: '`rekeySideFacts` runs first; this removal keeps its compacted array, so it does not use the setter',
  },
  'mutate/matchUps/drawPositions/swapWinnerLoser.ts': {
    count: 1,
    why: 'a SUBSTITUTION: two participants exchange everything, and `followWinnerAcrossResort` re-points the winner',
  },
  'mutate/drawDefinitions/luckyDrawAdvancement.ts': {
    count: 3,
    why: 'lucky-draw pairing builds a round fresh; nothing side-keyed exists on it yet',
  },
  'mutate/drawDefinitions/pruneDrawDefinition.ts': { count: 1, why: 'renumbering: every position maps, no side moves' },
  'mutate/drawDefinitions/resetDrawDefinition.ts': {
    count: 2,
    why: 'a reset: the side-keyed facts are reset with the positions (`toBePlayed`)',
  },
};

function writers(dir: string, root: string, found: Record<string, number>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) writers(full, root, found);
    else if (entry.name.endsWith('.ts')) {
      const count = fs
        .readFileSync(full, 'utf8')
        .split('\n')
        .filter((line) => WRITE.test(line)).length;
      if (count) found[path.relative(root, full).split(path.sep).join('/')] = count;
    }
  }
  return found;
}

it('every drawPositions writer in src/mutate is the setter or a listed exception', () => {
  const root = path.resolve(__dirname, '../..');
  const found = writers(path.join(root, 'mutate'), root, {});
  // CONTROL: the scan reads what it says it reads; the setter itself is found
  expect(found['mutate/matchUps/drawPositions/setMatchUpDrawPositions.ts']).toEqual(1);

  const expected = Object.fromEntries(Object.entries(ALLOWED).map(([file, { count }]) => [file, count]));
  expect(
    found,
    'route the new writer through setMatchUpDrawPositions, or list it with why it cannot move a side',
  ).toEqual(expected);
});
