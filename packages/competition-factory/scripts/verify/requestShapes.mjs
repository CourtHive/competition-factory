#!/usr/bin/env node
/**
 * check:request-shapes — the REQUEST-shape typing guard.
 *
 * WHY THIS EXISTS
 * The factory types its DOMAIN data rigorously — `EventTypeUnion`, `DrawTypeUnion`,
 * `SeedingProfileEnum` and friends are closed, value-exported, and protected by
 * `check:enum-exports`. That rigour historically stopped at the function boundary:
 * request shapes reached for `any` and for bare `string` even where a closed union
 * for that exact field already existed a few lines away.
 *
 * That decays silently. `GetDrawDataArgs` was authored in #4825 specifically to give
 * an untyped query an argument type, and its own output carried `publishStatus?: any`
 * and `status?: string`. Nobody was careless — there was simply nothing asserting the
 * invariant, so every new Args type starts the erosion again. This is the same failure
 * shape, and the same remedy, as the hand-maintained enum value-export list that
 * shipped 16 `undefined`s in 6.16.0.
 *
 * WHAT IT CHECKS
 * Over every REQUEST shape (see SCOPE below), two rules:
 *
 *   1. NO BARE `any`      — a member annotated exactly `any` / `any[]`.
 *                           An index signature to `any` is the deliberate open-map
 *                           idiom and is NOT flagged.
 *   2. NO BARE `string`   — where a CLOSED union already types a field of that name
 *                           elsewhere under `src/types/`. The registry is derived, not
 *                           listed: if `matchUpType` is `EventTypeUnion` in 40 places
 *                           and `string` in one, that one is the drift.
 *
 * A union carrying `(string & {})` is NOT closed and never sources rule 2 — otherwise
 * the escape hatch would propagate itself into a requirement.
 *
 * WHAT RULE 2 DOES NOT COVER, stated plainly so the green run is not read as more than it is:
 * a field is protected only if SOME OTHER declaration under `src/types/` types that same
 * field name with a closed union. `SeedingProfile.positioning` is the sole site naming
 * `positioning`, so if it regressed to `string` rule 2 would not see it — the union it
 * should have had would have vanished with it. Rule 1 still covers that field against `any`.
 * Closing the gap would need a hand-maintained field->union pin list, which is the exact
 * artifact whose drift motivated `check:enum-exports`; a narrower true guard beats a wider
 * one that rots.
 *
 * SCOPE — what counts as a request shape:
 *   - any exported `type`/`interface` under `src/` whose name ends in `Args`
 *   - any exported `type`/`interface` under `src/types/` whose name ends in `Profile`
 *     (SeedingProfile, ContextProfile, PairingProfile … the sub-objects Args types nest)
 * Result shapes are deliberately out of scope: a permissive return type costs a consumer
 * nothing, while a permissive argument type is how bad input reaches the engine.
 *
 * THE ALLOWLIST is the point as much as the rules are. Debt that cannot be paid today is
 * ENUMERATED in requestShapes.allow.json with a reason, so it is countable rather than
 * invisible. An allowlist entry matching nothing is itself a failure — the same
 * stale-waiver rule `verify:audit` applies to security advisories.
 *
 * Run:        pnpm check:request-shapes
 * Self-test:  pnpm check:request-shapes --self-test   (asserts the rules FIRE)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const SRC = join(ROOT, 'src');
const TYPES_DIR = join(SRC, 'types');
const ALLOW = join(__dirname, 'requestShapes.allow.json');

const args = new Set(process.argv.slice(2));
const selfTest = args.has('--self-test');

const SKIP_DIRS = new Set(['tests', 'node_modules', 'forge']);

/** Every .ts file under src/, excluding tests and generated noise. */
function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pull `export type Name = { … };` and `export interface Name { … }` bodies out of a
 * source string. Brace-counted rather than regex-matched so a nested object member
 * does not truncate the body — `roundPlayoffs?: { [k: number]: WithPlayoffsArgs }`
 * would end the declaration early under a lazy match, and silently drop every member
 * after it from the scan.
 */
function declarations(src) {
  const found = [];
  const head = /^export (?:type (\w+) = \{|interface (\w+)[^{]*\{)/gm;
  let m;
  while ((m = head.exec(src)) !== null) {
    const name = m[1] ?? m[2];
    const bodyStart = src.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    let i = bodyStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    found.push({ name, body: src.slice(bodyStart + 1, i), bodyOffset: bodyStart + 1 });
  }
  return found;
}

/** `field?: Type;` members at the TOP level of a body — nested object literals skipped. */
function members(body) {
  const out = [];
  let depth = 0;
  let lineStart = 0;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (i === body.length || (ch === '\n' && depth === 0)) {
      const line = body.slice(lineStart, i);
      lineStart = i + 1;
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      // `name?: Type;` — the leading `[` guard skips index signatures.
      const mm = /^(\w+)\??:\s*([^;]+);?\s*$/.exec(t);
      if (mm) out.push({ field: mm[1], annotation: mm[2].trim(), text: t });
    }
  }
  return out;
}

const CLOSED_UNION = /^(\w+Union|\w+Enum)$/;

/**
 * Field-name -> closed union, derived from how src/types/ ALREADY types each field.
 * Only unions that are genuinely closed qualify: a `*Union` alias whose declaration
 * contains `(string & {})` is an open type wearing a closed type's name.
 */
function closedUnionRegistry(extraSources = []) {
  const typeSources = [
    ...readdirSync(TYPES_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(TYPES_DIR, f), 'utf8')),
    ...extraSources,
  ];

  const openUnions = new Set();
  const knownUnions = new Set();
  for (const src of typeSources) {
    for (const m of src.matchAll(/^export type (\w+Union) = (.+);$/gm)) {
      knownUnions.add(m[1]);
      if (m[2].includes('string & {')) openUnions.add(m[1]);
    }
    for (const m of src.matchAll(/^export enum (\w+)/gm)) knownUnions.add(m[1]);
  }

  const candidates = new Map();
  for (const src of typeSources) {
    for (const { body } of declarations(src)) {
      for (const { field, annotation } of members(body)) {
        if (!CLOSED_UNION.test(annotation)) continue;
        if (!knownUnions.has(annotation) || openUnions.has(annotation)) continue;
        if (!candidates.has(field)) candidates.set(field, new Set());
        candidates.get(field).add(annotation);
      }
    }
  }

  // A field name only licenses an inference if it is UNAMBIGUOUS. `status` is typed by
  // PracticeRegistrationStatusUnion on a practice registration and is a publish-state
  // key on GetDrawDataArgs — same name, unrelated value sets. Inferring across that
  // collision would demand a union that is simply wrong, which is worse than no union
  // at all. Polysemous names are therefore dropped rather than arbitrated.
  const byField = new Map();
  for (const [field, unions] of candidates) {
    if (unions.size === 1) byField.set(field, [...unions][0]);
  }
  return byField;
}

function isRequestShape(name, file) {
  if (name.endsWith('Args')) return true;
  return name.endsWith('Profile') && dirname(file) === TYPES_DIR;
}

/** Both rules, over one already-parsed source string. Pure, so --self-test can reuse it. */
function scan(files, registry) {
  const violations = [];
  for (const { file, src } of files) {
    const rel = relative(ROOT, file);
    for (const { name, body, bodyOffset } of declarations(src)) {
      if (!isRequestShape(name, file)) continue;
      for (const { field, annotation, text } of members(body)) {
        const line = src.slice(0, bodyOffset + body.indexOf(text)).split('\n').length;
        if (annotation === 'any' || annotation === 'any[]') {
          violations.push({ key: `${name}.${field}`, rule: 'no-bare-any', file: rel, line, annotation });
        } else if (annotation === 'string' && registry.has(field)) {
          violations.push({
            key: `${name}.${field}`,
            rule: 'no-bare-string',
            file: rel,
            line,
            annotation: `string (closed union exists: ${registry.get(field)})`,
          });
        }
      }
    }
  }
  return violations;
}

function loadAllowlist() {
  if (!existsSync(ALLOW)) return {};
  const parsed = JSON.parse(readFileSync(ALLOW, 'utf8'));
  return parsed.allow ?? {};
}

/**
 * Prove the rules FIRE. An invariant measured at zero without ever having been shown
 * to fail is not evidence — it is indistinguishable from a scan that matches nothing.
 * Both rules are exercised against a synthetic source, plus one control that must NOT
 * trip so a scan that flags everything also fails here.
 */
function runSelfTest() {
  const fixture = [
    'export type FabricatedRequestArgs = {',
    '  offendingAny?: any;',
    '  offendingAnyArray?: any[];',
    '  offendingString?: string;',
    '  controlTyped?: EventTypeUnion;',
    '  controlUnregisteredString?: notAFieldAnyUnionTypes;',
    '  [key: string]: any;',
    '};',
    'export type FabricatedResultShape = {',
    '  ignoredBecauseNotARequest?: any;',
    '};',
  ].join('\n');

  const registry = closedUnionRegistry();

  // The polysemy rule must be shown to FIRE, not merely to be present. Two synthetic
  // domain types claim one field name for two different closed unions; the name must
  // drop out of the registry, and must be present when only one of them exists.
  const claimA = 'export type SyntheticDomainA = {\n  collidingField?: EventTypeUnion;\n};';
  const claimB = 'export type SyntheticDomainB = {\n  collidingField?: GenderUnion;\n};';
  if (closedUnionRegistry([claimA]).get('collidingField') !== 'EventTypeUnion') {
    console.error('[request-shapes] SELF-TEST FAIL: an unambiguous field did not enter the registry.');
    process.exit(1);
  }
  if (closedUnionRegistry([claimA, claimB]).has('collidingField')) {
    console.error('[request-shapes] SELF-TEST FAIL: the polysemy rule did not drop a contested field name.');
    process.exit(1);
  }

  // `offendingString` must resolve through the DERIVED registry, not a literal, so a
  // regression that empties the registry fails this test rather than passing it.
  if (!registry.has('matchUpType')) {
    console.error('[request-shapes] SELF-TEST FAIL: closed-union registry is empty (expected matchUpType).');
    process.exit(1);
  }
  const fixtureSrc = fixture.replace('offendingString?: string;', 'matchUpType?: string;');
  const found = scan([{ file: join(SRC, 'types/__fixture__.ts'), src: fixtureSrc }], registry);
  const keys = found.map((v) => `${v.key}:${v.rule}`).sort();
  const expected = [
    'FabricatedRequestArgs.matchUpType:no-bare-string',
    'FabricatedRequestArgs.offendingAny:no-bare-any',
    'FabricatedRequestArgs.offendingAnyArray:no-bare-any',
  ];
  const ok = keys.length === expected.length && keys.every((k, i) => k === expected[i]);
  if (!ok) {
    console.error('[request-shapes] SELF-TEST FAIL — the rules did not fire as specified.');
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(keys)}`);
    process.exit(1);
  }
  console.log(
    '[request-shapes] SELF-TEST OK — both rules fire, the polysemy rule drops a contested name, ' +
      'and an index signature and a result shape are correctly ignored.',
  );
}

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

const registry = closedUnionRegistry();
const files = sourceFiles().map((file) => ({ file, src: readFileSync(file, 'utf8') }));
const violations = scan(files, registry);
const allow = loadAllowlist();

const unexpected = violations.filter((v) => !allow[v.key]);
const usedAllowKeys = new Set(violations.filter((v) => allow[v.key]).map((v) => v.key));
const staleAllowKeys = Object.keys(allow).filter((k) => !usedAllowKeys.has(k));

let failed = false;

if (unexpected.length) {
  failed = true;
  console.error(`[request-shapes] FAIL: ${unexpected.length} untyped request-shape field(s):`);
  for (const v of unexpected) {
    console.error(`  ${v.file}:${v.line}  ${v.key} — ${v.rule} (${v.annotation})`);
  }
  console.error('');
  console.error('  Type the field, or add it to scripts/verify/requestShapes.allow.json WITH A REASON.');
}

if (staleAllowKeys.length) {
  failed = true;
  console.error(
    `[request-shapes] FAIL: ${staleAllowKeys.length} allowlist entr(ies) match nothing — the debt was paid:`,
  );
  for (const k of staleAllowKeys) console.error(`  ${k}`);
  console.error('');
  console.error('  Remove them from scripts/verify/requestShapes.allow.json.');
}

if (failed) process.exit(1);

const shapes = new Set();
for (const { file, src } of files) {
  for (const { name } of declarations(src)) if (isRequestShape(name, file)) shapes.add(name);
}
console.log(
  `[request-shapes] OK — ${shapes.size} request shapes scanned, ${registry.size} closed-union fields in registry, ` +
    `${usedAllowKeys.size} allowlisted.`,
);
