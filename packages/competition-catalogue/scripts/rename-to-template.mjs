#!/usr/bin/env node
// Rename the catalogue's policy names from POLICY_* to TEMPLATE_* across the tracked files of a git checkout.
//
//   node rename-to-template.mjs [--dry] [--exclude <regex>]... [path...]
//
// Run it from the checkout's root. With no paths it walks `git ls-files`. Only the exact names in RENAMES change,
// matched as whole identifiers, so the factory's own POLICY_*_DEFAULT names (and every other POLICY_ name) are left
// alone. Files whose base name is a renamed name are moved with `git mv`.
//
// Historical text is skipped by default: CHANGELOG files, and migration and what's-new pages for versions before 8.
// Those describe the names as they were.
//
// A name that appears as a whole quoted string ('POLICY_RATINGS_FIVB') in a code file is renamed like any other, and also listed at
// the end: if it is a label stored on a record or a name input that a test means to refuse, restore it by hand.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const OLD_NAMES = [
  'POLICY_OFFICIATING_CONFLICT_OF_INTEREST_ITF',
  'POLICY_OFFICIATING_EVALUATION_CHAIR_UMPIRE',
  'POLICY_OFFICIATING_EVALUATION_REFEREE',
  'POLICY_PROGRESSION_USTA',
  'POLICY_RANKING_POINTS_ATP',
  'POLICY_RANKING_POINTS_CTS',
  'POLICY_RANKING_POINTS_ITF_JUNIOR',
  'POLICY_RANKING_POINTS_ITF_JUNIOR_2025',
  'POLICY_RANKING_POINTS_ITF_WTT',
  'POLICY_RANKING_POINTS_LTA',
  'POLICY_RANKING_POINTS_TENNIS_AUSTRALIA',
  'POLICY_RANKING_POINTS_TENNIS_CANADA',
  'POLICY_RANKING_POINTS_TENNIS_EUROPE',
  'POLICY_RANKING_POINTS_USTA_JUNIOR_2025',
  'POLICY_RANKING_POINTS_USTA_JUNIOR_2026',
  'POLICY_RANKING_POINTS_WTA',
  'POLICY_RATINGS_ELO_538_NBA',
  'POLICY_RATINGS_ELO_538_NFL',
  'POLICY_RATINGS_ELO_538_NHL',
  'POLICY_RATINGS_ELO_538_TENNIS',
  'POLICY_RATINGS_ELO_WELO_TENNIS',
  'POLICY_RATINGS_ELO_WORLD_FOOTBALL',
  'POLICY_RATINGS_FIFA_SUM',
  'POLICY_RATINGS_FIFA_WOMEN',
  'POLICY_RATINGS_FIVB',
  'POLICY_RATINGS_WORLD_RUGBY',
  'POLICY_ROUND_ROBIN_TALLY_FIBA',
  'POLICY_ROUND_ROBIN_TALLY_FIVB',
  'POLICY_ROUND_ROBIN_TALLY_JTT',
  'POLICY_ROUND_ROBIN_TALLY_MLS',
  'POLICY_ROUND_ROBIN_TALLY_PREMIER_LEAGUE',
  'POLICY_ROUND_ROBIN_TALLY_TOC',
  'POLICY_ROUND_ROBIN_TALLY_USTA_LEAGUE',
  'POLICY_SANCTIONING_ITF',
  'POLICY_SANCTIONING_USTA',
  'POLICY_SCORING_USTA',
  'POLICY_SEEDING_ITF',
];
export const RENAMES = Object.fromEntries(OLD_NAMES.map((name) => [name, name.replace(/^POLICY_/, 'TEMPLATE_')]));

const TEXT = /\.(?:[cm]?[jt]sx?|json|jsonc|mdx?|ya?ml|sh|html|svelte|vue|txt)$/;
const HISTORY = [/(^|\/)CHANGELOG[^/]*$/i, /(^|\/)migration-[0-7]\.[^/]*$/, /(^|\/)whats-new-[0-7]\.[^/]*$/];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const excludes = [...HISTORY];
const paths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry') continue;
  if (args[i] === '--exclude') excludes.push(new RegExp(args[++i]));
  else paths.push(args[i]);
}

const longestFirst = Object.keys(RENAMES).sort((a, b) => b.length - a.length);
const pattern = new RegExp(`(?<![A-Za-z0-9_$])(${longestFirst.join('|')})(?![A-Za-z0-9_$])`, 'g');
const quoted = new RegExp(`(['"])(${longestFirst.join('|')})\\1`, 'g');
const CODE = /\.(?:[cm]?[jt]sx?|json|jsonc|svelte|vue)$/;

const files = execFileSync('git', ['ls-files', '-z', '--', ...paths], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && TEXT.test(file) && !excludes.some((rx) => rx.test(file)));

let changedFiles = 0;
let occurrences = 0;
const literals = [];
const moves = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // a submodule or a deleted path
  }
  let count = 0;
  const next = text.replace(pattern, (name) => (count++, RENAMES[name]));
  if (count) {
    changedFiles++;
    occurrences += count;
    if (CODE.test(file))
      text.split('\n').forEach((line, index) => {
        if (quoted.test(line)) literals.push(`${file}:${index + 1}: ${line.trim()}`);
        quoted.lastIndex = 0;
      });
    if (!dry) writeFileSync(file, next);
  }
  const stem = basename(file).replace(/\.[^.]+$/, '');
  if (RENAMES[stem]) moves.push([file, join(dirname(file), basename(file).replace(stem, RENAMES[stem]))]);
}
for (const [from, to] of moves) {
  if (!dry) execFileSync('git', ['mv', from, to]);
}

console.log(`${dry ? '[dry] ' : ''}${occurrences} occurrences in ${changedFiles} files; ${moves.length} files moved`);
if (literals.length) {
  console.log('\nQuoted names (renamed; restore any that is a stored label or a refused name input):');
  for (const line of literals) console.log(`  ${line}`);
}
