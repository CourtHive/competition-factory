#!/usr/bin/env node
/**
 * verify:declarations — the published declarations must not change shape unseen.
 *
 * Builds the three declaration bundles rollup ships (root, `constants`, `score-entry-state`) for HEAD's working tree and
 * for the merge base with a base ref (default `origin/dev`), then fingerprints every export: the export's declaration
 * plus every top-level declaration it reaches, printed canonically. Reports exports added, removed and changed.
 *
 * A byte diff is useless here: an import-graph change with no semantic change rewrites tens of thousands of lines
 * (rollup's `$n` collision suffixes renumber, inferred unions reorder, namespace members are reached by alias or not).
 * Each normalization below was forced by a false positive (Mentat FACTORY_TYPE_GRAPH_SPLIT_PLAN.md § "The
 * declaration-diff exit gate"), and `--self-test` pins every one of them, plus the controls that must fire.
 *
 *   node scripts/verify/declarations.mjs --self-test
 *   node scripts/verify/declarations.mjs [--base <ref>] [--mode required|informational]
 *                                        [--head-dts <dir>] [--base-dts <dir>] [--out <dir>] [--dump <export>]
 *
 * --base <ref>       compare against `git merge-base HEAD <ref>` (default origin/dev); built in a temporary detached
 *                    worktree that shares this checkout's node_modules by symlink and is always removed
 * --head-dts <dir>   use already-built bundles for HEAD (e.g. `dist` after `pnpm build`) instead of building them
 * --base-dts <dir>   use already-built bundles for the base (e.g. an unpacked npm tarball's `dist`); no worktree
 * --mode required    exit 1 on any added, removed or changed export (the default)
 * --mode informational  always exit 0; the report also goes to $GITHUB_STEP_SUMMARY when that is set
 * --out <dir>        keep the bundles and fingerprints there (default: a temporary directory, removed afterwards)
 * --dump <export>    write that export's canonical closure, base and head, to --out for review
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT), '../..');
const ts = createRequire(join(ROOT, 'package.json'))('typescript');
const TAG = '[verify:declarations]';

// Mirrors `engineTypes`, `constantsTypes` and `scoreEntryStateTypes` in rollup.config.mjs; `assertBundlesMatchConfig`
// fails when that config stops naming one of them. (`dist/governors.d.ts` is a re-export list of the root's names.)
export const BUNDLES = [
  { name: 'root', input: 'src/index.ts', file: 'tods-competition-factory.d.ts' },
  { name: 'constants', input: 'src/constants/index.ts', file: 'constants.d.ts' },
  { name: 'score-entry-state', input: 'src/scoreEntryState/index.ts', file: 'score-entry-state.d.ts' },
];

// ---------------------------------------------------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------------------------------------------------

/** rollup-plugin-dts disambiguates colliding names as `Name$1`, `Name$2`, … in module order. */
const strip = (name) => name.replace(/\$\d+/g, '');
const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);
const sha = (text, n = 16) => createHash('sha256').update(text).digest('hex').slice(0, n);
const isExported = (st) => st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
// the public name of `x as Y` in an export specifier names nothing in this file
const isPublicSpecifierName = (n) =>
  ts.isIdentifier(n) && ts.isExportSpecifier(n.parent) && n.parent.propertyName && n.parent.name === n;

function collect(sf) {
  const decls = new Map(); // local name -> top-level statements declaring it
  const exportsMap = new Map(); // public name -> local name
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        push(decls, d.name.text, st);
        if (isExported(st)) exportsMap.set(d.name.text, d.name.text);
      }
    } else if (st.name && ts.isIdentifier(st.name)) {
      push(decls, st.name.text, st);
      if (isExported(st)) exportsMap.set(st.name.text, st.name.text);
    }
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.moduleSpecifier) {
      for (const el of st.exportClause.elements) exportsMap.set(el.name.text, (el.propertyName ?? el.name).text);
    }
  }
  return { decls, exportsMap };
}

// rollup-plugin-dts reaches a namespace member sometimes through a synthesized alias (`type ns_X = X;`) and sometimes
// directly, depending on module order. Such aliases are transparent.
function namespaceAliases(decls) {
  const alias = new Map();
  for (const [name, sts] of decls) {
    const [st] = sts;
    const plain =
      sts.length === 1 &&
      /_[A-Za-z0-9]+$/.test(name) &&
      ts.isTypeAliasDeclaration(st) &&
      !st.typeParameters &&
      ts.isTypeReferenceNode(st.type) &&
      !st.type.typeArguments &&
      ts.isIdentifier(st.type.typeName) &&
      decls.has(st.type.typeName.text);
    if (plain) alias.set(name, st.type.typeName.text);
  }
  return alias;
}

/**
 * Fingerprint every export of one bundled .d.ts text.
 * @returns {{ exports: Record<string, { local: string, closure: number, sha: string }>, collisions: number,
 *   decls: number, body: (pub: string) => string }}
 */
export function fingerprint(text, fileName = 'bundle.d.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const { decls, exportsMap } = collect(sf);
  const alias = namespaceAliases(decls);
  const through = (k) => {
    let x = k;
    const seen = new Set();
    while (alias.has(x) && !seen.has(x)) {
      seen.add(x);
      x = alias.get(x);
    }
    return x;
  };
  for (const k of alias.keys()) decls.delete(k);

  // Names that still collide once `$n` is stripped get a suffix hashed from their own canonical text, so which of
  // two `Request`s rollup numbered first does not matter.
  const byStripped = new Map();
  for (const k of decls.keys()) push(byStripped, strip(k), k);
  const collisions = [...byStripped.values()].filter((v) => v.length > 1);
  const canonName = new Map();
  let hashPass = true;
  const nameOf = (l) => (hashPass ? strip(l) : (canonName.get(l) ?? strip(l)));

  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, sf);
  const canon = (node) => {
    const transformer = (ctx) => (root) => {
      const visit = (n) => {
        if (isPublicSpecifierName(n)) return n;
        if (ts.isIdentifier(n) && alias.has(n.text)) return ts.factory.createIdentifier(nameOf(through(n.text)));
        if (ts.isIdentifier(n) && decls.has(n.text) && n.text !== nameOf(n.text))
          return ts.factory.createIdentifier(nameOf(n.text));
        if (ts.isJSDoc?.(n)) return undefined;
        const v = ts.visitEachChild(n, visit, ctx);
        // union and intersection member order follows the program's type ids, not the source
        if (ts.isUnionTypeNode(v) || ts.isIntersectionTypeNode(v)) {
          const members = [...v.types]
            .map((t) => [print(t), t])
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
            .map((x) => x[1]);
          return ts.isUnionTypeNode(v)
            ? ts.factory.createUnionTypeNode(members)
            : ts.factory.createIntersectionTypeNode(members);
        }
        return v;
      };
      return ts.visitNode(root, visit);
    };
    const r = ts.transform(node, [transformer]);
    const out = print(r.transformed[0]).replace(/\s+/g, ' ');
    r.dispose();
    return out;
  };
  // Statements of one name (declaration merging) are sorted, except function overloads, whose order is resolution
  // order and so part of the signature: they stay in source order as one chunk.
  const ownText = (local) => {
    const sts = decls.get(local) ?? [];
    const overloads = sts.filter((st) => ts.isFunctionDeclaration(st)).map(canon);
    const rest = sts.filter((st) => !ts.isFunctionDeclaration(st)).map(canon);
    if (overloads.length) rest.push(overloads.join('\n'));
    return rest.sort().join('\n');
  };
  for (const l of collisions.flat()) canonName.set(l, `${strip(l)}#${sha(ownText(l), 8)}`);
  hashPass = false;

  const textCache = new Map();
  const textOf = (l) => textCache.get(l) ?? textCache.set(l, ownText(l)).get(l);
  const refsCache = new Map();
  const refsOf = (local) => {
    if (refsCache.has(local)) return refsCache.get(local);
    const refs = new Set();
    const walk = (n) => {
      const id = ts.isIdentifier(n) && !isPublicSpecifierName(n) ? through(n.text) : null;
      if (id && decls.has(id) && id !== local) refs.add(id);
      ts.forEachChild(n, walk);
    };
    for (const st of decls.get(local) ?? []) walk(st);
    refsCache.set(local, refs);
    return refs;
  };
  const closureOf = (local) => {
    const seen = new Set([local]);
    const stack = [local];
    while (stack.length) {
      for (const r of refsOf(stack.pop())) {
        if (!seen.has(r)) {
          seen.add(r);
          stack.push(r);
        }
      }
    }
    return seen;
  };
  const entries = (pub) => {
    const local = through(exportsMap.get(pub));
    const pairs = [...closureOf(local)].map((l) => [nameOf(l), textOf(l)]);
    return pairs.sort((a, b) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  };
  const body = (pub) =>
    exportsMap.has(pub)
      ? entries(pub)
          .map(([n, t]) => `${n}::${t}`)
          .join('\n')
      : '';

  const result = {};
  for (const pub of [...exportsMap.keys()].sort()) {
    const closure = entries(pub);
    result[pub] = {
      local: strip(through(exportsMap.get(pub))),
      closure: closure.length,
      sha: sha(closure.map(([n, t]) => `${n}::${t}`).join('\n')),
    };
  }
  return {
    exports: result,
    collisions: collisions.length,
    decls: decls.size,
    body,
    closureTexts: (pub) => new Map(exportsMap.has(pub) ? entries(pub) : []),
  };
}

/** Exports added, removed and changed between two fingerprints. */
export function diff(base, head) {
  const a = base.exports;
  const b = head.exports;
  return {
    removed: Object.keys(a).filter((k) => !b[k]),
    added: Object.keys(b).filter((k) => !a[k]),
    changed: Object.keys(a).filter((k) => b[k] && a[k].sha !== b[k].sha),
  };
}

/** The canonical declarations behind the changed exports, each with how many changed exports reach it. */
function changedDeclarations(base, head, changed) {
  const counts = new Map();
  for (const pub of changed) {
    const x = base.closureTexts(pub);
    const y = head.closureTexts(pub);
    for (const name of new Set([...x.keys(), ...y.keys()])) {
      if (x.get(name) === y.get(name)) continue;
      const what = !x.has(name) ? 'added' : !y.has(name) ? 'removed' : 'changed';
      const key = `${name} (${what})`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------------------------------
// Building the bundles
// ---------------------------------------------------------------------------------------------------------------------

function assertBundlesMatchConfig() {
  const config = readFileSync(join(ROOT, 'rollup.config.mjs'), 'utf8');
  const missing = BUNDLES.filter((b) => !config.includes(`'${b.input}'`) || !config.includes(`/${b.file}\``));
  if (missing.length)
    throw new Error(
      `rollup.config.mjs no longer names ${missing.map((b) => `${b.input} -> ${b.file}`).join(', ')}; update BUNDLES`,
    );
}

/** Build the three declaration bundles of the package at `pkgRoot` into `outDir`, as rollup.config.mjs does. */
async function buildBundles(root, outDir) {
  const pkgRoot = realpathSync(root);
  const { rollup } = await import('rollup');
  const { dts } = await import('rollup-plugin-dts');
  const { paths } = JSON.parse(readFileSync(join(pkgRoot, 'tsconfig.base.json'), 'utf8')).compilerOptions;
  mkdirSync(outDir, { recursive: true });
  for (const bundle of BUNDLES) {
    const build = await rollup({
      input: join(pkgRoot, bundle.input),
      plugins: [dts({ compilerOptions: { paths } })],
      onwarn: (warning) => {
        if (warning.code !== 'CIRCULAR_DEPENDENCY') console.warn(`${TAG} ${bundle.name}: ${warning.message}`);
      },
    });
    // rollup-plugin-dts resolves the `paths` aliases against the process's cwd, not the tsconfig: a build of another
    // tree from here would mix both trees' sources. `buildInChild` sets the cwd; this proves it.
    const foreign = build.watchFiles.filter((f) => !f.includes('/node_modules/') && !f.startsWith(pkgRoot + '/'));
    if (foreign.length)
      throw new Error(`${bundle.name} read files outside ${pkgRoot}: ${foreign.slice(0, 3).join(', ')}`);
    const { output } = await build.generate({ format: 'es' });
    await build.close();
    writeFileSync(join(outDir, bundle.file), output[0].code);
  }
}

/** Build in a child process so the base and head builds run in parallel; `children` collects their kill switches. */
function buildInChild(pkgRoot, outDir, children) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [SCRIPT, '--build-bundles', pkgRoot, outDir], {
      cwd: pkgRoot,
      stdio: 'inherit',
    });
    const kill = registerCleanup(() => child.exitCode === null && child.kill());
    children.push(kill);
    child.on('error', fail);
    child.on('exit', (code) => {
      kill();
      if (code === 0) done();
      else fail(new Error(`declaration build of ${pkgRoot} failed`));
    });
  });
}

// Cleanups run on Ctrl-C or SIGTERM too: child builds killed, the base worktree removed, the temporary directory
// deleted, newest first. Each is also run (and unregistered) on the normal path.
const cleanups = new Set();
const onSignal = (signal) => {
  for (const cleanup of [...cleanups].reverse()) cleanup();
  process.kill(process.pid, signal);
};
function registerCleanup(cleanup) {
  if (!cleanups.size) process.once('SIGINT', onSignal).once('SIGTERM', onSignal);
  const run = () => {
    if (!cleanups.delete(run)) return;
    if (!cleanups.size) process.off('SIGINT', onSignal).off('SIGTERM', onSignal);
    cleanup();
  };
  cleanups.add(run);
  return run;
}

const git = (args, cwd = ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' }).trim();

/** A detached worktree of `sha` that borrows this checkout's node_modules; `remove` always cleans it up. */
function baseWorktree(sha, dir) {
  const top = git(['rev-parse', '--show-toplevel']);
  const pkgRel = relative(top, ROOT);
  git(['worktree', 'add', '--detach', '--quiet', dir, sha]);
  const remove = registerCleanup(() => {
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git(['worktree', 'prune']);
    }
  });
  try {
    if (!existsSync(join(dir, pkgRel, 'tsconfig.base.json')))
      throw new Error(`${sha.slice(0, 10)} has no ${pkgRel}/tsconfig.base.json; choose a later base`);
    for (const rel of ['node_modules', join(pkgRel, 'node_modules')]) {
      const from = join(top, rel);
      if (existsSync(from) && !existsSync(join(dir, rel))) symlinkSync(from, join(dir, rel), 'dir');
    }
  } catch (error) {
    remove();
    throw error;
  }
  return { pkgRoot: join(dir, pkgRel), remove };
}

// ---------------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------------

const LIST_LIMIT = 40;
const list = (names) =>
  names.length > LIST_LIMIT
    ? `${names.slice(0, LIST_LIMIT).join(', ')}, … (+${names.length - LIST_LIMIT})`
    : names.join(', ');

function renderMarkdown({ results, baseLabel, mode, seconds }) {
  const total = results.reduce((n, r) => n + r.added.length + r.removed.length + r.changed.length, 0);
  const lines = [
    `### verify:declarations (${mode})`,
    '',
    `Base: ${baseLabel}. ${total ? `**${total} export change(s).**` : 'No exported declaration changed.'} ${seconds}s.`,
    '',
    '| Bundle | Exports (base → head) | Added | Removed | Changed |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.baseCount} → ${r.headCount} | ${r.added.length} | ${r.removed.length} | ${r.changed.length} |`,
    ),
  ];
  for (const r of results) {
    if (!r.added.length && !r.removed.length && !r.changed.length) continue;
    lines.push('', `#### ${r.name}`, '');
    if (r.removed.length) lines.push(`- removed: ${list(r.removed)}`);
    if (r.added.length) lines.push(`- added: ${list(r.added)}`);
    if (r.changed.length) lines.push(`- changed: ${list(r.changed)}`);
    if (r.declarations.length)
      lines.push(
        `- declarations behind the changes (changed exports reaching each): ${list(
          r.declarations.map(([name, n]) => `\`${name}\` ×${n}`),
        )}`,
      );
  }
  if (total && mode === 'informational')
    lines.push('', 'Informational: this PR is not a type-split PR, so a declaration change does not fail it.');
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------------------------------------------------

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function compare() {
  const mode = option('--mode') ?? 'required';
  if (!['required', 'informational'].includes(mode)) throw new Error(`--mode must be required or informational`);
  const keep = option('--out');
  if (option('--dump') && !keep) throw new Error('--dump writes into --out <dir>; give one');
  const started = Date.now();
  if (keep) mkdirSync(resolve(keep), { recursive: true });
  // the real path: rollup-plugin-dts resolves aliases against the real cwd, and macOS's tmpdir is a symlink
  const work = realpathSync(keep ? resolve(keep) : mkdtempSync(join(tmpdir(), 'verify-declarations-')));
  const removeWork = registerCleanup(() => keep || rmSync(work, { recursive: true, force: true }));
  try {
    const results = await buildAndFingerprint(work);
    return report(results, mode, ((Date.now() - started) / 1000).toFixed(1));
  } finally {
    if (keep) console.log(`${TAG} bundles kept in ${work}`);
    removeWork();
  }
}

async function buildAndFingerprint(work) {
  const headDts = option('--head-dts') ? resolve(option('--head-dts')) : join(work, 'head');
  const baseDts = option('--base-dts') ? resolve(option('--base-dts')) : join(work, 'base');
  let baseLabel = baseDts;
  let worktree;
  const children = [];
  try {
    assertBundlesMatchConfig();
    const builds = [];
    if (!option('--base-dts')) {
      const ref = option('--base') ?? 'origin/dev';
      const sha = git(['merge-base', 'HEAD', ref]);
      baseLabel = `merge base of HEAD and ${ref} (${sha.slice(0, 10)})`;
      worktree = baseWorktree(sha, join(work, 'base-worktree'));
      builds.push(buildInChild(worktree.pkgRoot, baseDts, children));
    }
    if (!option('--head-dts')) builds.push(buildInChild(ROOT, headDts, children));
    await Promise.all(builds);
  } finally {
    for (const kill of children) kill();
    worktree?.remove();
  }

  const results = BUNDLES.map((bundle) => {
    const read = (dir) => {
      const file = join(dir, bundle.file);
      if (!existsSync(file)) throw new Error(`${file} missing`);
      return fingerprint(readFileSync(file, 'utf8'), file);
    };
    const base = read(baseDts);
    const head = read(headDts);
    const d = diff(base, head);
    const dump = option('--dump');
    if (dump && (base.exports[dump] || head.exports[dump])) {
      writeFileSync(join(work, `${bundle.name}.${dump}.base.txt`), base.body(dump) + '\n');
      writeFileSync(join(work, `${bundle.name}.${dump}.head.txt`), head.body(dump) + '\n');
    }
    return {
      name: bundle.name,
      ...d,
      baseCount: Object.keys(base.exports).length,
      headCount: Object.keys(head.exports).length,
      declarations: changedDeclarations(base, head, d.changed),
    };
  });
  return { results, baseLabel };
}

function report({ results, baseLabel }, mode, seconds) {
  const markdown = renderMarkdown({ results, baseLabel, mode, seconds });
  const total = results.reduce((n, r) => n + r.added.length + r.removed.length + r.changed.length, 0);

  for (const r of results) {
    console.log(
      `${TAG} ${r.name}: ${r.baseCount} -> ${r.headCount} exports; ` +
        `added ${r.added.length}, removed ${r.removed.length}, changed ${r.changed.length}`,
    );
    if (r.removed.length) console.log(`  removed: ${list(r.removed)}`);
    if (r.added.length) console.log(`  added: ${list(r.added)}`);
    if (r.changed.length) console.log(`  changed: ${list(r.changed)}`);
    for (const [name, n] of r.declarations.slice(0, 20)) console.log(`    ${name}: reached by ${n} changed export(s)`);
  }
  console.log(`${TAG} base: ${baseLabel}; ${seconds}s`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  if (!total) {
    console.log(`${TAG} OK: no exported declaration changed`);
    return 0;
  }
  if (mode === 'informational') {
    console.log(`${TAG} ${total} export change(s), informational only`);
    return 0;
  }
  console.log(
    `${TAG} FAIL: ${total} export change(s). A type-split PR may not change a published declaration; ` +
      'inspect one with --out <dir> --dump <export>.',
  );
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------------
// Self-test: synthetic bundles, no build
// ---------------------------------------------------------------------------------------------------------------------

const FIXTURE = `
/** a doc comment */
interface Request$1 { id: string; kind: 'a' | 'b' | 'c'; }
interface Request { url: string; }
interface MatchUp { matchUpId: string; score?: string; side: Side & Tagged; }
type Side = 1 | 2;
interface Tagged { tag?: string; }
interface Note { text: string; }
interface Shown { x: number; }
type ns_Shown = Shown;
declare namespace info { export { ns_Shown as Shown, Note as Hint }; }
declare function pick(a: string): string;
declare function pick(a: number): number;
interface Merged { a: string; }
declare namespace Merged { const b: number; }
declare const api: { run(r: Request$1): Request; };
declare namespace wire { export { Request$1 as Request }; }
interface Holder { shown: ns_Shown; }
export { MatchUp, Request$1 as EngineRequest, Request as HttpRequest, api, info, pick, Merged, Holder, wire };
`;

const swap = (text, pairs) => pairs.reduce((t, [from, to]) => t.split(from).join(to), text);

function selfTest() {
  const base = fingerprint(FIXTURE);
  const cases = [
    // controls
    ['identical bundles', FIXTURE, { changed: 0 }],
    [
      'one optional field made required',
      swap(FIXTURE, [['score?: string', 'score: string']]),
      { changed: 1, which: ['MatchUp'] },
    ],
    [
      'a field change reaches every export whose closure holds it',
      swap(FIXTURE, [['id: string', 'id: number']]),
      { changed: 3, which: ['EngineRequest', 'api', 'wire'] },
    ],
    [
      'an export removed and one added',
      swap(FIXTURE, [['Holder, wire };', 'wire, Note as Annotation };']]),
      { changed: 0, added: ['Annotation'], removed: ['Holder'] },
    ],
    [
      'function overloads reordered',
      swap(FIXTURE, [
        ['declare function pick(a: string): string;', '@@'],
        ['declare function pick(a: number): number;', 'declare function pick(a: string): string;'],
        ['@@', 'declare function pick(a: number): number;'],
      ]),
      { changed: 1, which: ['pick'] },
    ],
    // normalizations
    [
      'union and intersection members reordered',
      swap(FIXTURE, [
        ["'a' | 'b' | 'c'", "'c' | 'a' | 'b'"],
        ['Side & Tagged', 'Tagged & Side'],
        ['1 | 2', '2 | 1'],
      ]),
      { changed: 0 },
    ],
    ['rollup `$n` suffix renumbered', swap(FIXTURE, [['Request$1', 'Request$9']]), { changed: 0 }],
    [
      'colliding names numbered the other way round',
      swap(FIXTURE, [
        ['interface Request$1 {', 'interface @@A {'],
        ['interface Request {', 'interface Request$1 {'],
        ['interface @@A {', 'interface Request {'],
        ['run(r: Request$1): Request;', 'run(r: Request): Request$1;'],
        ['Request$1 as EngineRequest, Request as HttpRequest', 'Request as EngineRequest, Request$1 as HttpRequest'],
        ['export { Request$1 as Request }', 'export { Request as Request }'],
      ]),
      { changed: 0 },
    ],
    [
      'a reference moved from one colliding name to the other',
      swap(FIXTURE, [['run(r: Request$1): Request;', 'run(r: Request): Request$1;']]),
      { changed: 1, which: ['api'] },
    ],
    [
      'namespace member reached directly rather than through its alias',
      swap(FIXTURE, [['shown: ns_Shown;', 'shown: Shown;']]),
      { changed: 0 },
    ],
    ['comments dropped', swap(FIXTURE, [['/** a doc comment */', '// another comment']]), { changed: 0 }],
    [
      'declaration-merging statements reordered',
      swap(FIXTURE, [
        [
          'interface Merged { a: string; }\ndeclare namespace Merged { const b: number; }',
          'declare namespace Merged { const b: number; }\ninterface Merged { a: string; }',
        ],
      ]),
      { changed: 0 },
    ],
    [
      'an export specifier public name never joins a closure',
      `${FIXTURE}\ninterface Hint { unrelated: boolean; }\n`,
      { changed: 0 },
    ],
  ];
  // a planted change inside a namespace member must still reach the namespace
  cases.push([
    'a namespace member changed',
    swap(FIXTURE, [['x: number', 'x: string']]),
    { changed: 2, which: ['Holder', 'info'] },
  ]);

  let ok = true;
  for (const [name, text, expect] of cases) {
    const d = diff(base, fingerprint(text));
    const problems = [];
    if (d.changed.length !== expect.changed)
      problems.push(`changed ${d.changed.length} (${d.changed}), want ${expect.changed}`);
    if (expect.which && d.changed.join() !== expect.which.join())
      problems.push(`changed [${d.changed}], want [${expect.which}]`);
    if ((expect.added ?? []).join() !== d.added.join())
      problems.push(`added [${d.added}], want [${expect.added ?? []}]`);
    if ((expect.removed ?? []).join() !== d.removed.join())
      problems.push(`removed [${d.removed}], want [${expect.removed ?? []}]`);
    console.log(`${TAG} self-test ${name}: ${problems.length ? `FAIL\n  ${problems.join('\n  ')}` : 'OK'}`);
    ok = ok && !problems.length;
  }
  // the fixture must exercise what it claims to
  const sanity = [
    ['exports', Object.keys(base.exports).length === 9],
    ['stripped-name collisions', base.collisions === 1],
    ['namespace alias resolved', !base.body('Holder').includes('ns_Shown')],
  ];
  for (const [name, pass] of sanity) {
    console.log(`${TAG} self-test fixture ${name}: ${pass ? 'OK' : 'FAIL'}`);
    ok = ok && pass;
  }
  const md = renderMarkdown({
    results: [
      {
        name: 'root',
        baseCount: 1,
        headCount: 1,
        added: [],
        removed: [],
        changed: ['X'],
        declarations: [['X (changed)', 1]],
      },
    ],
    baseLabel: 'fixture',
    mode: 'informational',
    seconds: '0.0',
  });
  const mdOk = md.includes('| root | 1 → 1 | 0 | 0 | 1 |') && md.includes('`X (changed)` ×1');
  console.log(`${TAG} self-test summary rendering: ${mdOk ? 'OK' : 'FAIL'}`);
  return ok && mdOk;
}

// ---------------------------------------------------------------------------------------------------------------------

if (process.argv[1] === SCRIPT) {
  if (process.argv.includes('--build-bundles')) {
    const i = process.argv.indexOf('--build-bundles');
    await buildBundles(process.argv[i + 1], process.argv[i + 2]);
  } else if (process.argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  } else {
    try {
      process.exit(await compare());
    } catch (error) {
      console.error(`${TAG} ${error.message}`);
      // informational runs never fail a PR, but say loudly that they did not run
      if (option('--mode') === 'informational') {
        console.log(`::warning::verify:declarations did not run: ${error.message}`);
        if (process.env.GITHUB_STEP_SUMMARY)
          appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### verify:declarations\n\nDid not run: ${error.message}\n`);
        process.exit(0);
      }
      process.exit(1);
    }
  }
}
