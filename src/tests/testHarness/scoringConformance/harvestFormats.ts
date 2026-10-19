import { competitionFormats } from '@Fixtures/scoring/competitionFormats';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { matchUpFormats } from '@Fixtures/scoring/matchUpFormats';
import { MATCH_ROOTS } from '@Constants/matchUpFormatConstants';
import { EDGE_CODES } from '../corpus/grammarSource';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Every matchUpFormat code valid for new use that the factory names: its format fixtures, its
 * competition profiles, the grammar corpus's edge codes, and every literal in its tests and scoring
 * docs. A format a test or a doc uses is a format someone expects to score, so each one lands in a
 * matrix cell that must be classified. A code that parses but is refused for new use (a tiebreak below
 * S − 1, an aggregate of standard sets; CA 2026-10-18, scoring engine spec § 16 decision 19) is only
 * replayed, never scored live, so it is no cell's (the tests that pin the refusal name such codes).
 * Returns code → the first source it was seen in.
 */
export function harvestFormats(root = '.'): Map<string, string> {
  const found = new Map<string, string>();
  const add = (code: unknown, source: string) => {
    if (typeof code === 'string' && !found.has(code) && isValidMatchUpFormat({ matchUpFormat: code }))
      found.set(code, source);
  };

  for (const code of Object.values(matchUpFormats)) add(code, 'fixtures/matchUpFormats');
  for (const profile of Object.values(competitionFormats))
    add((profile as any).matchUpFormat, 'fixtures/competitionFormats');
  for (const code of EDGE_CODES) add(code, 'corpus/grammarSource');

  const roots = [...MATCH_ROOTS].sort((a, b) => b.length - a.length).join('|');
  const literal = new RegExp(`['"\`]((?:${roots})\\d+[A-Z]*(?:-[A-Za-z0-9:@/.]+)+|T\\d+P?)['"\`]`, 'g');
  const scan = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (/\.(?:ts|md|mdx)$/.test(entry.name))
        for (const match of fs.readFileSync(file, 'utf8').matchAll(literal)) add(match[1], path.relative(root, file));
    }
  };
  scan(path.join(root, 'src/tests'));
  scan(path.join(root, 'documentation/docs/scoring-engine'));
  return found;
}
