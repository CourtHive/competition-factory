#!/usr/bin/env node
/**
 * `verify:source-provenance` — comments and test titles state rules, not who decided them or where that was recorded.
 *
 * ## What this guards
 *
 * The repository is public. Its source comments, JSDoc and test titles used to carry the project's internal
 * governance trail: who ruled on a behaviour and when, ruling and plan ids, and pointers into the private planning
 * repository. They were rewritten to state the behaviour, rule or reason itself; this gate stops them coming back.
 * `verify:docs-provenance` guards the published documentation, the READMEs and the CHANGELOG with the same rules
 * (`scripts/lib/provenanceRules.mjs`); this gate covers every other tracked text file.
 *
 * ## Why a sibling gate, not more of `verify:docs-provenance`
 *
 * The docs gate reads prose, so it checks every line. Source cannot be read that way: a variable, a constant, a
 * fixture's `'CA'` nationality or a parsed format code matches the same patterns and is not text anyone reads as
 * prose. This gate separates text from code first, with TypeScript's own scanner, and that is a different walk, a
 * different cost and a different allowlist shape (it holds back whole files for open PRs). The rule set is shared,
 * so the two cannot drift.
 *
 * ## What it checks
 *
 * Every tracked file outside `documentation/` (and outside the three files the docs gate reads), by kind:
 *
 * - JS/TS (`.ts .mts .cts .js .mjs .cjs`): the text of every comment (JSDoc included) and every test title, the
 *   first string argument of `describe`/`it`/`test`/`suite`/`bench` and their `.only`/`.skip`/`.each(…)`/… forms.
 *   In runtime source (`src/`, tests aside) every string literal too, because an error message, result field or
 *   notice payload reaches callers. Code is never read: an identifier such as `CA` or `ca` cannot trip it.
 * - Markdown, YAML, shell, hooks and other plain text: every line (these are prose or comment-heavy config).
 * - JSON: only the values of prose keys (`$comment`, `description`, `comment`, `note`, `notes`, `why`,
 *   `rationale`); other values are data. A `.json` file that does not parse (JSON with comments) is read as text.
 *
 * The scanner is TypeScript's (`ts.createScanner`), driven the way the parser drives it: a `/` is rescanned as a
 * regular expression where an expression can start, and a `}` that closes a template substitution is rescanned as
 * the template's continuation, so neither a regex nor a template is mistaken for a comment. No JSX is tracked in
 * this repository; a `.tsx`/`.jsx` file fails the walk rather than being scanned wrongly.
 *
 * ## Allowing a legitimate use
 *
 * Add an entry to `ALLOW`: the rule (or `'*'`), the repo-relative file, optionally a regex the whole source LINE
 * holding the hit must match (omitted: every line of the file), and why. An entry that matches nothing fails as
 * STALE, so the list only shrinks by deletion and cannot keep a dead permission.
 *
 * Self-test:  node scripts/verify/sourceProvenance.mjs --self-test
 */
import { REPO_ROOT, repoPath } from '../lib/repoRoot.mjs';
import { RULES } from '../lib/provenanceRules.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const TAG = '[verify:source-provenance]';

const pkg = (path) => repoPath(path);

/**
 * Legitimate or held-back lines a rule would otherwise flag. `file` is repo-relative; `line`, when present, must match
 * the line's text (omitted: every line of the file). Each entry fails as STALE once nothing it covers is a hit.
 */
export const ALLOW = [
  // ---- the gates themselves: they name the references they forbid, in their documentation and self-tests
  ...[
    'scripts/lib/provenanceRules.mjs',
    'scripts/verify/docsProvenance.mjs',
    'scripts/verify/sourceProvenance.mjs',
  ].map((file) => ({ rule: '*', file: pkg(file), why: 'a provenance gate: it quotes the references it forbids' })),
  {
    rule: 'ca',
    file: pkg('src/fixtures/countryData.ts'),
    line: /^\s*iso2: 'CA',$/,
    why: 'ISO 3166-1 alpha-2 code (Canada) in the country fixture, a runtime string that is data',
  },
  {
    rule: 'plan-id',
    file: pkg('src/tests/mocks/generatedOutcomesAreLegal.test.ts'),
    line: /completed at P3[12] /,
    why: 'P31/P32 is the combined-total format code of `SET1-S:P32`, not a plan id',
  },
  {
    rule: 'plan-id',
    file: pkg('src/tests/scoring/conformance/combinedTotals.conformance.test.ts'),
    line: /SET1-S:P32, P31, P4:/,
    why: 'P31 is a combined-total format code (`SET1-S:P31`), not a plan id',
  },
];

const JS = /\.(ts|mts|cts|js|mjs|cjs)$/;
const JSX = /\.(tsx|jsx)$/;
const JSON_FILE = /\.(json|jsonl)$/;
const PLAIN =
  /\.(md|mdx|txt|ya?ml|jsonc|sh|toml)$|(^|\/)\.husky\/[^/.]+$|(^|\/)\.(gitignore|npmrc|nvmrc|prettierignore|tool-versions|npmignore)$/;
const SKIP = [/(^|\/)pnpm-lock\.yaml$/, /(^|\/)package-lock\.json$/, /^documentation\//, /(^|\/)\.husky\/_\//];
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]s$/;
const PROSE_KEYS = new Set(['$comment', 'description', 'comment', 'note', 'notes', 'why', 'rationale']);

/** True for runtime package source, whose string literals can reach a caller. */
const isRuntime = (file) => file.startsWith(pkg('src/')) && !TEST_FILE.test(file);

// ---------------------------------------------------------------------------------------------------------------------
// Text extraction

const TITLE_CALLS = new Set(['describe', 'it', 'test', 'suite', 'bench']);
const TITLE_MODIFIERS = new Set(['only', 'skip', 'todo', 'concurrent', 'sequential', 'fails', 'shuffle']);
// modifiers whose call returns the function that takes the title: `it.each(table)('title', fn)`
const TITLE_FACTORIES = new Set(['each', 'for', 'skipIf', 'runIf']);
// keywords after which a `/` starts a regular expression
const REGEX_AFTER_KEYWORD = new Set(
  [
    'return',
    'typeof',
    'instanceof',
    'in',
    'of',
    'new',
    'delete',
    'void',
    'throw',
    'case',
    'do',
    'else',
    'yield',
    'await',
  ].map((word) => ts.SyntaxKind[`${word[0].toUpperCase()}${word.slice(1)}Keyword`]),
);
const K = ts.SyntaxKind;

function regexAllowed(prev) {
  if (prev === undefined) return true;
  if (REGEX_AFTER_KEYWORD.has(prev)) return true;
  if (prev >= K.FirstPunctuation && prev <= K.LastPunctuation) {
    return ![K.CloseParenToken, K.CloseBracketToken, K.CloseBraceToken, K.PlusPlusToken, K.MinusMinusToken].includes(
      prev,
    );
  }
  return false;
}

/**
 * The comment, test-title and string-literal text of a JS/TS source, each with its 1-based start line.
 * Returns `[{ kind: 'comment' | 'title' | 'string', line, text }]`.
 */
export function extractScript(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const lineOf = lineIndex(text);
  const out = [];
  const braces = []; // per open brace: '{' for a block or object, 'title' / 'string' for a template substitution
  const parens = []; // per open paren: the title chain state it was opened in
  let prev; // the last significant token
  let chain = ''; // '' | 'call' (a describe/it/test chain whose next `(` takes the title) | 'factory' (`.each(` etc.)
  let titleArg = false; // this token is the first argument of a title-taking call
  let token;
  while ((token = scanner.scan()) !== K.EndOfFileToken) {
    if (token === K.WhitespaceTrivia || token === K.NewLineTrivia || token === K.ShebangTrivia) continue;
    if (token === K.SingleLineCommentTrivia || token === K.MultiLineCommentTrivia) {
      out.push({ kind: 'comment', line: lineOf(scanner.getTokenStart()), text: scanner.getTokenText() });
      continue;
    }
    if ((token === K.SlashToken || token === K.SlashEqualsToken) && regexAllowed(prev))
      token = scanner.reScanSlashToken();
    let kind = '';
    if (token === K.CloseBraceToken && braces.length && braces.at(-1) !== '{') {
      token = scanner.reScanTemplateToken(false);
      kind = token === K.TemplateTail ? braces.pop() : braces.at(-1);
    } else if (token === K.CloseBraceToken) braces.pop();
    else if (token === K.OpenBraceToken) braces.push('{');
    else if (token === K.TemplateHead) {
      kind = titleArg ? 'title' : 'string';
      braces.push(kind);
    } else if (token === K.StringLiteral || token === K.NoSubstitutionTemplateLiteral)
      kind = titleArg ? 'title' : 'string';
    if (kind) out.push({ kind, line: lineOf(scanner.getTokenStart()), text: scanner.getTokenText() });

    // the describe/it/test chain
    titleArg = false;
    if (token === K.Identifier) {
      const name = scanner.getTokenValue();
      if (prev !== K.DotToken && TITLE_CALLS.has(name)) chain = 'call';
      else if (prev === K.DotToken && chain && TITLE_FACTORIES.has(name)) chain = 'factory';
      else if (prev === K.DotToken && chain && TITLE_MODIFIERS.has(name)) chain = 'call';
      else chain = '';
    } else if (token === K.OpenParenToken) {
      parens.push(chain);
      titleArg = chain === 'call';
      chain = '';
    } else if (token === K.CloseParenToken) {
      chain = parens.pop() === 'factory' ? 'call' : '';
    } else if (token !== K.DotToken) chain = '';
    prev = token;
  }
  return out;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** The prose values of a JSON (or JSON Lines) document, each with its line. */
function extractJson(text, file) {
  const out = [];
  const docs = file.endsWith('.jsonl') ? text.split('\n') : [text];
  const lineOf = lineIndex(text);
  let offset = 0;
  for (const doc of docs) {
    let value;
    try {
      value = doc.trim() ? JSON.parse(doc) : undefined;
    } catch {
      return [{ kind: 'line', line: 1, text }]; // JSON with comments (.vscode/*.json): read it as plain text
    }
    const visit = (node, key) => {
      if (typeof node === 'string') {
        if (!PROSE_KEYS.has(key)) return;
        const at = text.indexOf(JSON.stringify(node).slice(1, -1).slice(0, 40), offset);
        out.push({ kind: 'prose', line: at >= 0 ? lineOf(at) : 1, text: node });
      } else if (Array.isArray(node)) node.forEach((child) => visit(child, key));
      else if (node && typeof node === 'object') for (const [k, child] of Object.entries(node)) visit(child, k);
    };
    visit(value, '');
    offset += doc.length + 1;
  }
  return out;
}

/** Every segment of readable text in `file`, by kind. */
export function extract(file, text) {
  if (JSX.test(file)) throw new Error(`${file}: JSX is not scanned; teach the walk JSX before tracking one`);
  if (JS.test(file)) return extractScript(text);
  if (JSON_FILE.test(file)) return extractJson(text, file);
  return [{ kind: 'line', line: 1, text }];
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking

/** Every hit in `files` ({ path: text }), allowlist applied; plus the allowlist entries that matched nothing. */
export function check(files, { rules = RULES, allow = ALLOW } = {}) {
  const hits = [];
  const used = new Set();
  for (const [file, text] of Object.entries(files)) {
    const runtime = isRuntime(file);
    const lines = text.split('\n');
    for (const segment of extract(file, text)) {
      if (segment.kind === 'string' && !runtime) continue;
      segment.text.split('\n').forEach((line, offset) => {
        for (const rule of rules) {
          const match = rule.pattern.exec(line);
          if (!match) continue;
          // the rule reads the text alone; the allowlist and the report see the whole source line
          const source = lines[segment.line - 1 + offset] ?? line;
          const permit = allow.findIndex(
            (a) => (a.rule === '*' || a.rule === rule.name) && a.file === file && (!a.line || a.line.test(source)),
          );
          if (permit >= 0) {
            used.add(permit);
            continue;
          }
          hits.push({
            file,
            line: segment.line + offset,
            rule: rule.name,
            what: rule.what,
            kind: segment.kind,
            text: source.trim(),
          });
        }
      });
    }
  }
  const stale = allow.filter((entry, index) => !used.has(index) && entry.file in files);
  const missing = allow.filter((entry) => !(entry.file in files));
  return { hits, stale: [...stale, ...missing] };
}

/** The files this gate reads, repo-relative: every tracked text file the docs gate does not. */
function targets() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
  const docsGate = new Set(['README.md', repoPath('README.md'), repoPath('CHANGELOG.md')]);
  return out
    .split('\0')
    .filter(Boolean)
    .filter((file) => !docsGate.has(file) && !SKIP.some((skip) => skip.test(file)))
    .filter((file) => JS.test(file) || JSX.test(file) || JSON_FILE.test(file) || PLAIN.test(file));
}

// ---------------------------------------------------------------------------------------------------------------------

function selfTest() {
  const assert = (ok, what) => {
    if (!ok) {
      console.error(`${TAG} self-test FAILED — ${what}`);
      process.exit(1);
    }
  };
  const runtime = pkg('src/x.ts');
  const testFile = pkg('src/tests/x.test.ts');
  const hitsIn = (file, text) => check({ [file]: text }, { allow: [] }).hits;
  const kinds = (file, text) => hitsIn(file, text).map((hit) => `${hit.kind}:${hit.rule}`);

  // comments, JSDoc and test titles are read, in runtime source and tests alike
  assert(
    kinds(runtime, '// a closed segment takes no input (CA 2026-10-18)\nconst x = 1;').join() === 'comment:ca',
    'line comment',
  );
  assert(
    kinds(runtime, '/**\n * Retired (P58, 2026-10-22).\n */\nexport const y = 2;').join() === 'comment:plan-id',
    'JSDoc',
  );
  assert(
    hitsIn(runtime, '/**\n * ok\n * see Mentat/planning/X.md\n */')[0]?.line === 3,
    'a JSDoc hit reports its own line',
  );
  assert(kinds(testFile, "it('refuses it (F-014)', () => {});").join() === 'title:finding-id', 'it title');
  assert(
    kinds(testFile, 'describe.each([[1]])(`ruling 33 holds for %s`, () => {});').join() === 'title:ruling-id',
    'each title',
  );
  assert(
    kinds(testFile, "test.skipIf(slow)('SE2a-D3b applies', () => {});").join() === 'title:decision-id',
    'skipIf title',
  );
  assert(
    kinds(testFile, 'it(`v2 ${name}: debate-ruled`, () => {});').join() === 'title:debate-ruled',
    'template title',
  );
  assert(
    kinds(testFile, "it.only('as the controlling session agreed', fn);").join() === 'title:controlling-session',
    'only title',
  );

  // code and test data are not read: identifiers, fixtures, non-title strings in tests
  assert(
    kinds(testFile, "const CA = 'CA'; const ca = 1; expect(x.nationalityCode).toEqual('CA');").length === 0,
    'test data',
  );
  assert(
    kinds(testFile, "const P58 = 1; it('ok', () => expect(f('ruling 1')).toBe(P58));").length === 0,
    'test-body string',
  );
  assert(kinds(runtime, 'const TASKS = []; export const F = TASKS.length;').length === 0, 'identifiers');
  // a regex or a template is not mistaken for a comment, and a comment-like string is not one
  assert(kinds(runtime, 'const re = /\\/\\/ CA/; const t = `${a}/* CA */`;').join() === 'string:ca', 'regex/template');
  assert(kinds(runtime, 'const r = a / b; // P58\nconst s = c / d;').join() === 'comment:plan-id', 'division vs regex');
  assert(
    kinds(runtime, 'const r = `x${ { a: 1 }.a }y`; // fine\n// OPEN-3').join() === 'comment:open-id',
    'nested braces in template',
  );

  // runtime strings reach callers and are read; a state or country code is data
  assert(kinds(runtime, "throw new Error('refused per ruling 27');").join() === 'string:ruling-id', 'runtime message');
  assert(kinds(runtime, "const states = { CA: 'California' };").length === 0, 'a CA key is code');
  assert(kinds(runtime, "const c = ['US', 'CA'];").join() === 'string:ca', 'a CA code string is read (allowlist it)');
  // the near misses the docs gate keeps quiet stay quiet
  assert(
    kinds(runtime, '// CAPS and CANCELLED; `SET1-S:P32`; issue F-1; tasks are queued').length === 0,
    'near misses',
  );

  // other kinds: prose lines, prose JSON keys only
  assert(kinds('.github/workflows/x.yml', '# LAYOUT (CA, 2026-10-05).\nname: x').join() === 'line:ca', 'yaml line');
  const json = JSON.stringify({ description: 'Retired (Mentat P58)', nationalityCode: 'CA', reason: 'F-008' });
  assert(kinds(pkg('src/x.json'), json).join() === 'prose:mentat,prose:plan-id', 'json prose keys only');

  // the allowlist: scoped by rule, file and line; a whole-file hold; unused entries are STALE
  const allow = [
    { rule: 'ca', file: runtime, line: /USA-CA-X/, why: 'test' },
    { rule: '*', file: testFile, why: 'test' },
  ];
  const allowed = check({ [runtime]: '// USA-CA-X', [testFile]: '// CA\n// P58' }, { allow });
  assert(allowed.hits.length === 0 && allowed.stale.length === 0, 'allowlisted lines pass');
  assert(
    check({ [runtime]: '// USA-CA-X\n// (CA)' }, { allow: allow.slice(0, 1) }).hits.length === 1,
    'line-scoped entry',
  );
  assert(check({ [runtime]: '// clean' }, { allow: allow.slice(0, 1) }).stale.length === 1, 'an unused entry is STALE');
  assert(check({ [runtime]: '// clean' }, { allow }).stale.length === 2, 'an entry for a vanished file is STALE');
  for (const entry of ALLOW)
    assert(entry.rule === '*' || RULES.some((rule) => rule.name === entry.rule), `ALLOW names a rule: ${entry.rule}`);

  console.log(
    `${TAG} self-test OK — comments, JSDoc, test titles and runtime strings read; code, test data and near misses quiet; allowlist scoped, stale entries fail`,
  );
}

function run() {
  const paths = targets();
  // The control: a gate that read nothing reports clean. Assert the walk found the source, the scripts and CI.
  const required = [
    pkg('src/index.ts'),
    pkg('scripts/verify/docsProvenance.mjs'),
    '.github/workflows/verify.yml',
    '.husky/pre-commit',
  ];
  const missing = required.filter((path) => !paths.includes(path));
  if (paths.length < 3000 || missing.length) {
    console.error(
      `${TAG} only ${paths.length} files found (missing: ${missing.join(', ') || 'none'}) — the walk is wrong`,
    );
    process.exit(1);
  }
  const files = Object.fromEntries(paths.map((path) => [path, readFileSync(join(REPO_ROOT, path), 'utf8')]));
  const { hits, stale } = check(files);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ hits, stale: stale.map((s) => ({ ...s, line: String(s.line ?? '') })) }, null, 1));
    return;
  }
  if (hits.length || stale.length) {
    if (hits.length) {
      console.error(`${TAG} FAIL — ${hits.length} internal governance reference(s) in comments, titles or messages:`);
      for (const hit of hits)
        console.error(`  ${hit.file}:${hit.line}  [${hit.rule}, ${hit.kind}] ${hit.what}\n      ${hit.text}`);
      console.error(
        'State the behaviour, rule or rationale itself: drop who decided it, the ruling or plan id, and any pointer into the planning repository. A legitimate use goes in ALLOW in scripts/verify/sourceProvenance.mjs, with a reason.',
      );
    }
    for (const entry of stale)
      console.error(
        `  STALE allowlist entry: [${entry.rule}] ${entry.file} ${entry.line ?? '(whole file)'} — delete it`,
      );
    process.exit(1);
  }
  const held = ALLOW.filter((entry) => entry.why.startsWith('TEMPORARY')).length;
  console.log(
    `${TAG} OK — ${paths.length} files, no internal governance references (${ALLOW.length} allowlist entries, ${held} temporary)`,
  );
}

if (process.argv.includes('--self-test')) selfTest();
else run();
