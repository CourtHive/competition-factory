#!/usr/bin/env node
/**
 * Fail if a NEW file in `src/` reaches for `matchUpStatusCodes`.
 *
 * ## What this guards
 *
 * `matchUpStatusCodes` carried two unrelated tenants: the scoring policy's code vocabulary, and the
 * per-side provenance of a propagated exit. P37 evicted the second one — `sideExitProvenance` is the
 * side-KEYED first-class record, and the array is the positional string contract clients consume.
 *
 * CA's statement of the destination, 2026-09-27: *"we want to ultimately get away from dependance on
 * any legacy arrays!"* — meaning no behaviour anywhere derives from this array. The eviction got there
 * for the write path and for every read but one. Nothing stops it growing back, which is what this is.
 *
 * ## Why a FILE allowlist rather than a count or a line list
 *
 * Counting occurrences per file is brittle: an ordinary refactor inside an already-permitted file moves
 * the number and fails the gate for no reason, and a gate that cries wolf gets deleted. Pinning
 * `file:line` is worse — every edit above a pinned line breaks it.
 *
 * The regression this exists to catch is a **new site** reaching for the array, so the allowlist is by
 * FILE and each entry carries why it is there. Movement inside a listed file is free; a new file is a
 * failure. The complementary runtime guard is `convergingDoubleExitStatus.test.ts`, which asserts that
 * every PERSISTED element is a string — so a projection regrowing inside an allowlisted file is caught
 * there rather than here.
 *
 * ## Removing an entry
 *
 * Delete the line. The gate does not require the file to still be present, so the allowlist shrinks by
 * ordinary deletion and cannot silently retain a stale permission — an entry naming a file that no
 * longer mentions the array is reported as `STALE` and fails, which is how it ratchets down.
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
 * 2026-09-28 and the check below now REFUSES to let it grow again**, which is what makes CA's destination
 * enforceable rather than aspirational: *"we want to ultimately get away from dependance on any legacy
 * arrays!"*
 */
const ALLOWED = {
  // the tenant that stays: the policy's code vocabulary
  'fixtures/policies/POLICY_SCORING_DEFAULT.ts': 'POLICY',
  'fixtures/policies/POLICY_SCORING_USTA.ts': 'POLICY',
  'fixtures/scoring/outcomes/toBePlayed.ts': 'WRITE — the blanking fixture',
  'types/tournamentTypes.ts': 'POLICY — the published field and its element union',

  // the INPUT BOUNDARY: the one place a client's positional submission is read, and the place that makes
  // every downstream reader keyed rather than positional
  'mutate/matchUps/matchUpStatus/sideStatusCodes.ts':
    'BOUNDARY — splitStatusCodes reads the submitted array once and stores it keyed by attribution',

  // the named helpers: the one place that decides what the array holds
  'mutate/matchUps/matchUpStatus/sideExitProvenance.ts':
    'WRITE — deriveStatusCodes / retainPolicyCodes / policyCodeString / the symmetric clear',

  // writes, deriving from provenance or retaining the policy tenant
  'mutate/drawDefinitions/positionGovernor/doubleExitAdvancement.ts': 'WRITE — retainPolicyCodes',
  'mutate/drawDefinitions/matchUpGovernor/removeDoubleExit.ts': 'WRITE — retainPolicyCodes',
  'mutate/drawDefinitions/resetDrawDefinition.ts': 'WRITE — blanks on reset',
  'mutate/matchUps/drawPositions/assignDrawPositionBye.ts': 'WRITE — re-sides the policy code',
  'mutate/matchUps/drawPositions/positionClear.ts': 'WRITE — blanks',
  'mutate/matchUps/drawPositions/progressExitStatus.ts': 'WRITE — deriveStatusCodes',
  'mutate/matchUps/drawPositions/setMatchUpDrawPositions.ts':
    'WRITE — re-sides the policy codes with the participant whose side changed (option R, CA 2026-10-05)',
  'mutate/matchUps/drawPositions/removeDirectedParticipants.ts': 'WRITE — deriveStatusCodes',
  'mutate/matchUps/matchUpStatus/attemptToSetMatchUpStatusBYE.ts': 'WRITE — blanks',

  // plumbing: a caller-supplied value passed through
  'assemblies/generators/mocks/completeDrawMatchUps.ts': 'PLUMBING — mock outcome',
  'assemblies/generators/mocks/generateEventWithDraw.ts': 'PLUMBING — mock outcome',
  'mutate/drawDefinitions/matchUpGovernor/attemptToModifyScore.ts': 'PLUMBING',
  'mutate/matchUps/drawPositions/directParticipants.ts': 'PLUMBING — sourceMatchUpStatusCodes',
  'mutate/matchUps/matchUpStatus/setMatchUpState.ts': 'PLUMBING — the param type',
  'mutate/matchUps/matchUpStatus/setMatchUpStatus.ts': 'PLUMBING — outcome passthrough',
  'mutate/matchUps/outcome/differential.ts':
    'PLUMBING — compares the array v1 wrote with the array the plan carries, by value, never by position',
  'mutate/matchUps/outcome/view.ts':
    'PLUMBING — carries the existing array into the plan of the next write; decides nothing on it',
  'mutate/matchUps/outcome/types.ts': 'PLUMBING — the v2 request carries the submitted array to the write',
  'mutate/matchUps/outcome/write.ts':
    'WRITE — plans the write as modifyMatchUpScore performs it; the split is at the write (S2b)',
  'mutate/matchUps/score/modifyMatchUpScore.ts': 'PLUMBING — writes what its caller passed',
  'mutate/tournaments/dehydrate.ts': 'PLUMBING — serialization key list',

  // reads the POLICY tenant, which is legitimately positional by side
  'mutate/matchUps/drawPositions/drawPositionPlacement.ts': 'POLICY read — re-sides the policy code',
  'mutate/matchUps/drawPositions/swapWinnerLoser.ts': 'POLICY read — re-sides the policy codes on a flip',
  'query/drawDefinition/getStructureInconsistencies.ts': 'POLICY read — EXIT_CODE_ON_WINNER_SIDE',
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

const canary = 'mutate/matchUps/matchUpStatus/sideExitProvenance.ts';
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
  console.error('`matchUpStatusCodes` is the LEGACY array and its exit tenant was evicted (P37).');
  console.error('Read `sideExitProvenance` for per-side exit facts. If the new site genuinely belongs');
  console.error('to the POLICY tenant, add it to ALLOWED in scripts/verify/exitTenant.mjs with a reason.');
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
 * past this check re-opens a dependence that took P37, P41 and six refuted candidates to close.
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
