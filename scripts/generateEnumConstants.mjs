#!/usr/bin/env node
/**
 * Codegen: emit the primitive string consts for each enum-mirror const module
 * FROM its enum in `src/types/tournamentTypes.ts` (the single source of truth).
 *
 * The enums are the canonical definition; each `<name>Values.ts` is generated so
 * a const value can never drift from — or be hand-edited away from — its enum
 * member. The hand-authored `<name>Constants.ts` re-exports these and adds its
 * semantic helper arrays/objects (which reference the primitives).
 *
 * Only the dedicated 1:1 mirrors are generated; bucket modules
 * (drawDefinition/participant/gender) are grab-bags, not 1:1, and stay hand-authored
 * under the runtime + compile-time conformance guards (enumConstConformance).
 *
 * participantRoles joined this list after it drifted: it was a 1:1 mirror maintained BY HAND, so its
 * consts ran ahead of the enum (SCOREKEEPER/TIMEKEEPER existed as consts and not as enum members) and
 * two live roles became inexpressible for any type-safe consumer. Generation removes the failure mode
 * rather than guarding it after the fact.
 *
 * Regenerate via `pnpm gen:enum-constants`. CI runs `pnpm check:enum-constants`
 * which re-runs this with --check and fails on any diff.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TYPES = join(ROOT, 'src/types/tournamentTypes.ts');

// enum in tournamentTypes → generated values module (relative to ROOT).
const MIRRORS = [
  { enumName: 'MatchUpStatusEnum', out: 'src/constants/matchUpStatusValues.ts' },
  { enumName: 'EntryStatusEnum', out: 'src/constants/entryStatusValues.ts' },
  { enumName: 'SurfaceCategoryEnum', out: 'src/constants/surfaceValues.ts' },
  { enumName: 'WeekdayEnum', out: 'src/constants/weekdayValues.ts' },
  { enumName: 'BookingTypeEnum', out: 'src/constants/bookingTypeValues.ts' },
  { enumName: 'ParticipantRoleEnum', out: 'src/constants/participantRoleValues.ts' },
];

// Parse a string enum's `MEMBER = 'value'` members, in declaration order.
function parseEnumMembers(source, enumName) {
  const block = new RegExp(`export enum ${enumName} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!block) throw new Error(`enum ${enumName} not found in tournamentTypes.ts`);
  const members = [];
  const memberRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*'([^']*)',?\s*$/gm;
  let m;
  while ((m = memberRe.exec(block[1]))) members.push({ key: m[1], value: m[2] });
  if (!members.length) throw new Error(`enum ${enumName} has no string members (is it a string enum?)`);
  return members;
}

function renderValuesFile(enumName, members) {
  const banner = [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ` * Source: ${enumName} in src/types/tournamentTypes.ts`,
    ' * Regenerate: pnpm gen:enum-constants',
    ' * Drift guard:  pnpm check:enum-constants',
    ' */',
    '',
  ].join('\n');
  const consts = members.map(({ key, value }) => `export const ${key} = '${value}';`).join('\n');
  return `${banner}${consts}\n`;
}

const args = new Set(process.argv.slice(2));
const check = args.has('--check');

const source = readFileSync(TYPES, 'utf8');
let stale = false;
let total = 0;

for (const { enumName, out } of MIRRORS) {
  const members = parseEnumMembers(source, enumName);
  total += members.length;
  const next = renderValuesFile(enumName, members);
  const outPath = join(ROOT, out);

  if (check) {
    if (!existsSync(outPath)) {
      console.error(`[enum-constants] ${out} does not exist; run \`pnpm gen:enum-constants\`.`);
      stale = true;
      continue;
    }
    if (readFileSync(outPath, 'utf8') !== next) {
      console.error(`[enum-constants] ${out} is stale; run \`pnpm gen:enum-constants\`.`);
      stale = true;
    }
  } else {
    writeFileSync(outPath, next);
    console.log(`[enum-constants] wrote ${out} (${members.length} consts)`);
  }
}

if (check) {
  if (stale) process.exit(1);
  console.log(`[enum-constants] OK (${MIRRORS.length} modules, ${total} consts)`);
}
