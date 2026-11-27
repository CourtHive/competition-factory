#!/usr/bin/env node
/**
 * Fail if a file in `src/` reaches for `matchUpStatusCodes`, beyond the few that must.
 *
 * ## What this guards
 *
 * `matchUpStatusCodes` is the positional reason array records written before 8.0.0 hold. 8.x never writes it and no
 * decision reads it: a reason lives in `sideStatusCodes` (keyed by side) or `matchUpStatusCode` (the match), and an
 * exit's origin in `sideExitProvenance`. What may still name it is the scoring policy's own vocabulary key (a different
 * field of the same name), the published type and the stored key list, the read-only display of a pre-8.0.0 record, the
 * input boundary that refuses it, and the one helper that removes it from a matchUp a write touches. Nothing stops a
 * new reader growing back, which is what this is.
 *
 * ## Why a FILE allowlist rather than a count or a line list
 *
 * Counting occurrences per file is brittle: an ordinary refactor inside an already-permitted file moves the number and
 * fails the gate for no reason. Pinning `file:line` is worse. The regression this exists to catch is a **new site**
 * reaching for the array, so the allowlist is by FILE and each entry carries why it is there.
 *
 * ## Removing an entry
 *
 * Delete the line. An entry naming a file that no longer mentions the array is reported as `STALE` and fails, which is
 * how it ratchets down.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');
const NEEDLE = 'matchUpStatusCodes';

/**
 * Every file in `src/` (excluding `src/tests/`) permitted to mention `matchUpStatusCodes`, and why.
 *
 * `POLICY` — the scoring policy's own vocabulary, which is the tenant that stays.
 * `WRITE` — writes the array, deriving what it writes from provenance or retaining the policy tenant.
 * `PLUMBING` — passes a caller-supplied value through; decides nothing.
 * `BOUNDARY` — reads a client's positionally-submitted array ONCE, at the input edge, and converts it into
 *   a keyed form nothing downstream has to index. This is the opposite of a dependence: it is what ENDS
 *   one. There should be exactly one such site, and it is `sideStatusCodes.splitStatusCodes`.
 * `DECISION` — engine behaviour derives from the array's contents or shape. **This list reached ZERO on
 * 2026-09-28 and the check below now REFUSES to let it grow again**, which is what makes that destination
 * enforceable rather than aspirational: no dependence on any legacy array.
 */
const ALLOWED = {
  // the scoring policy's own vocabulary key, a different field of the same name
  'fixtures/policies/POLICY_SCORING_DEFAULT.ts': 'POLICY',
  'types/policyShapes.ts': 'POLICY — the scoring policy body type declares that key',

  // the published field, deprecated, so a pre-8.0.0 record still types; the stored key list
  'types/tournamentTypes.ts': 'TYPE — the deprecated field and its element union',
  'mutate/tournaments/dehydrate.ts': 'TYPE — serialization key list',

  // the one helper that removes it, and the planned writes that call it at a matchUp's stamp
  'helpers/drawTopology/legacyStatusCodes.ts': 'DROP — removed from a matchUp a write touches',
  'mutate/matchUps/lineUps/planReplacementEffects.ts': 'DROP — a planned stamp removes it as the live stamp does',

  // the input boundary: an outcome that still sends the array is refused
  'mutate/matchUps/matchUpStatus/sideStatusCodes.ts': 'BOUNDARY — readStatusReasonsInput refuses the positional input',

  // read-only display of a record written before 8.0.0
  'scoreEntryState/statusCodes.ts':
    'DISPLAY — the reason a recorded matchUp re-displays: sideStatusCodes and matchUpStatusCode first, [0] only for records written before them',
  'query/drawDefinition/getStructureInconsistencies.ts':
    'DISPLAY — EXIT_CODE_ON_WINNER_SIDE reads sideStatusCodes, and the array a pre-8.0.0 record holds',
};

/**
 * Strip comments so only CODE is searched.
 *
 * STRING LITERALS ARE DELIBERATELY KEPT. An earlier version stripped them too and immediately proved why
 * that is wrong: `mutate/tournaments/dehydrate.ts` names the field as a string in a serialization key
 * list, and the detector reported that file as a STALE allowlist entry — i.e. it could not see a real
 * reference. The same blindness would hide `matchUp['matchUpStatusCodes']`, which is precisely the
 * bracket-access escape a guard on a property name has to catch.
 */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'tests') continue;
      walk(full, found);
    } else if (/\.(ts|mts|cts)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

const files = walk(SRC);

// The control: a sweep that looked at nothing reports "clean", and an empty input is indistinguishable
// from a clean result. Assert it read a plausible tree and that a KNOWN mention is visible to it.
if (files.length < 500) {
  console.error(`[verify:exit-tenant] only ${files.length} source files scanned — the walk is wrong`);
  process.exit(1);
}

const mentions = new Set();
for (const file of files) {
  if (codeOnly(readFileSync(file, 'utf8')).includes(NEEDLE)) {
    mentions.add(relative(SRC, file).split(sep).join('/'));
  }
}

const canary = 'helpers/drawTopology/legacyStatusCodes.ts';
if (!mentions.has(canary)) {
  console.error(`[verify:exit-tenant] the canary ${canary} was not matched — the detector is broken`);
  process.exit(1);
}

const unlisted = [...mentions].filter((file) => !(file in ALLOWED)).sort();
const stale = Object.keys(ALLOWED)
  .filter((file) => !mentions.has(file))
  .sort();

if (unlisted.length) {
  console.error(`[verify:exit-tenant] ${unlisted.length} file(s) reach for \`${NEEDLE}\` and are not allowed:`);
  for (const file of unlisted) console.error(`  src/${file}`);
  console.error('');
  console.error(
    '`matchUpStatusCodes` is the positional array of records written before 8.0.0: nothing writes or reads it.',
  );
  console.error(
    'Read `sideStatusCodes` / `matchUpStatusCode` for reasons and `sideExitProvenance` for exit facts. If the',
  );
  console.error(
    'new site genuinely belongs to the policy vocabulary, add it to ALLOWED in scripts/verify/exitTenant.mjs.',
  );
  process.exit(1);
}

if (stale.length) {
  console.error(`[verify:exit-tenant] ${stale.length} allowlist entry(ies) no longer mention \`${NEEDLE}\`:`);
  for (const file of stale) console.error(`  src/${file}`);
  console.error('');
  console.error('Delete them — this is the gate ratcheting down, not a problem.');
  process.exit(1);
}

/**
 * THE RATCHET'S LAST TOOTH. No entry may be classified `DECISION`.
 *
 * The list reached zero on 2026-09-28, when `participatesInExitCascade` replaced the last two gates that
 * asked the LEGACY array whether the NATIVE record should be written. A budget at zero asserts nothing, so
 * this stops being a count and becomes a rule — the same promotion `UNCOLLAPSED_CONVERGENCE` got when its
 * population emptied.
 *
 * If you genuinely need to read the array to decide something, this is the conversation to have first: the
 * exit tenant is evicted and `sideExitProvenance` is the side-keyed record. Reclassifying an entry to get
 * past this check re-opens a dependence that took the exit-tenant eviction, the removal of the legacy fallback in
 * `modifyMatchUpScore`'s window and six refuted candidates to close.
 */
const decisions = Object.entries(ALLOWED).filter(([, reason]) => reason.includes('DECISION'));
if (decisions.length) {
  console.error(`[verify:exit-tenant] ${decisions.length} allowlist entry(ies) read the array to DECIDE:`);
  for (const [file, reason] of decisions) console.error(`  src/${file} — ${reason}`);
  console.error('');
  console.error('That count reached ZERO on 2026-09-28 and may not grow. Read `sideExitProvenance` instead.');
  process.exit(1);
}

console.log(`[verify:exit-tenant] OK — ${mentions.size} allowed file(s), 0 reading it to DECIDE`);
