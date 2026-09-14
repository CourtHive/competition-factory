/**
 * Import-convention audit + codemod for tods-competition-factory.
 *
 * Conventions enforced (see Mentat/standards/coding-standards.md § Imports):
 *   1. Reach other alias roots through the tsconfig alias, not a relative path
 *   2. Within each section, single-line imports descend by line length
 *   3. Multi-line destructured imports come last in their section
 *   4. One statement per module
 *   5. Section header comments: `// constants`, `// types`, `// constants and types`, `// Fixtures`
 *
 * Usage:
 *   node scripts/audit-imports.mjs                 # report, exit 1 if findings
 *   node scripts/audit-imports.mjs --json          # machine-readable report
 *   node scripts/audit-imports.mjs --fix           # apply every pass
 *   node scripts/audit-imports.mjs --fix=specifiers,dedupe,headers,order
 *   node scripts/audit-imports.mjs --max-findings=N  # ratchet gate for CI
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.AUDIT_SRC || path.join(ROOT, 'src');

const ALIASES = {
  '@Generators': 'assemblies/generators',
  '@Engines': 'tests/engines',
  '@Assemblies': 'assemblies',
  '@Validators': 'validators',
  '@Constants': 'constants',
  '@Functions': 'functions',
  '@Fixtures': 'fixtures',
  '@Forge': 'forge',
  '@Acquire': 'acquire',
  '@Helpers': 'helpers',
  '@Global': 'global',
  '@Mutate': 'mutate',
  '@Server': 'server',
  '@Query': 'query',
  '@Tests': 'tests',
  '@Tools': 'tools',
  '@Types': 'types',
};
const ALIAS_BY_DIR = Object.entries(ALIASES).sort((a, b) => b[1].length - a[1].length);

// Files emitted by `pnpm prebuild` generators — fix the generator, never the file.
const GENERATED = new Set([
  'src/types/methodSignatures.ts',
  'src/types/enumExports.ts',
  'src/types/factoryEngineMethods.ts',
  'src/constants/matchUpStatusValues.ts',
  'src/constants/bookingTypeValues.ts',
  'src/constants/weekdayValues.ts',
  'src/constants/entryStatusValues.ts',
  'src/constants/participantRoleValues.ts',
  'src/constants/surfaceValues.ts',
]);

// Aliasing a .json specifier makes rollup treat it as an external — see
// planning/FACTORY_IMPORT_AUDIT.md §5. @rollup/plugin-typescript's
// defaultInclude has no .json, so its resolveId returns null and nodeResolve,
// which knows nothing of tsconfig paths, leaves the specifier unresolved.
const isJson = (spec) => spec.endsWith('.json');

const CANONICAL_HEADERS = new Set(['// constants', '// types', '// constants and types', '// Fixtures']);
// Header spellings this codemod is allowed to rewrite. Anything else is prose
// and is left alone (and blocks reordering of its section).
const HEADER_RE =
  /^\/\/\/?\s*(import\s+(all\s+)?relevant\s+)?(constants?|contants|contstants|types?|fixtures)(\s*,?\s*(and\s+)?(constants?|contants|types?|fixtures))*\s*$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'scratch' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|mts|js)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function aliasFor(srcRel) {
  for (const [alias, dir] of ALIAS_BY_DIR) {
    if (srcRel === dir || srcRel.startsWith(dir + '/')) {
      const tail = srcRel.slice(dir.length).replace(/^\//, '');
      return { alias, suggestion: tail ? `${alias}/${tail}` : `${alias}/index` };
    }
  }
  return null;
}

const STMT_START = /^(import\b|export\s+(\*|\{|type\s*\{))/;
const isBlank = (l) => l.trim() === '';
const isComment = (l) => /^\s*(\/\/|\/\*|\*)/.test(l.trim());

/** Parse the contiguous leading import/export-from region of a file. */
function parseHeaderRegion(lines) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (STMT_START.test(lines[i])) {
      start = i;
      break;
    }
    if (!isBlank(lines[i]) && !isComment(lines[i])) return null; // code before any import
  }
  if (start === -1) return null;

  const items = [];
  let i = start;
  let end = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      items.push({ type: 'blank', start: i, end: i });
      i++;
      continue;
    }
    if (isComment(line) && !STMT_START.test(line)) {
      items.push({ type: 'comment', start: i, end: i, text: line.trim() });
      i++;
      continue;
    }
    if (!STMT_START.test(line)) break;

    let j = i,
      buf = line;
    const terminated = (b) => /from\s+['"][^'"]+['"]\s*;?\s*$/.test(b) || /^import\s+['"][^'"]+['"]\s*;?\s*$/.test(b);
    while (!terminated(buf) && j < lines.length - 1) {
      j++;
      buf += '\n' + lines[j];
    }
    const m = buf.match(/from\s+['"]([^'"]+)['"]/) || buf.match(/^import\s+['"]([^'"]+)['"]/);
    items.push({
      type: 'stmt',
      kindWord: line.startsWith('export') ? 'export' : 'import',
      start: i,
      end: j,
      text: buf,
      specifier: m ? m[1] : null,
      multiline: j > i,
      len: line.length,
      form: /^import\s+type\b/.test(line)
        ? 'type'
        : /^import\s+\*\s+as\b/.test(line)
          ? 'namespace'
          : /^import\s+['"]/.test(line)
            ? 'sideeffect'
            : /^import\s+\w+\s*(,|from)/.test(line)
              ? 'default'
              : 'named',
    });
    end = j;
    i = j + 1;
  }
  // trim trailing blanks/comments out of the region
  while (items.length && items.at(-1).type !== 'stmt') items.pop();
  if (!items.length) return null;
  return { start, end: items.at(-1).end, items };
}

/** Split header items into sections separated by blank lines / comments. */
function sectionize(items) {
  const sections = [];
  let cur = null;
  let pendingComments = [];
  let sawBreak = false;
  for (const it of items) {
    if (it.type === 'blank') {
      sawBreak = true;
      continue;
    }
    if (it.type === 'comment') {
      pendingComments.push(it.text);
      sawBreak = true;
      continue;
    }
    if (!cur || sawBreak) {
      cur = { header: pendingComments.length ? pendingComments.at(-1) : null, comments: pendingComments, stmts: [] };
      sections.push(cur);
      pendingComments = [];
      sawBreak = false;
    }
    cur.stmts.push(it);
  }
  return sections;
}

function sectionLabel(stmts) {
  const specs = stmts.map((s) => s.specifier || '');
  const has = (a) => specs.some((s) => s.startsWith(a));
  const all = (preds) => specs.every((s) => preds.some((p) => s.startsWith(p)));
  if (!all(['@Constants', '@Types', '@Fixtures'])) return null;
  const c = has('@Constants'),
    t = has('@Types'),
    f = has('@Fixtures');
  if (f && !c && !t) return '// Fixtures';
  if (c && t && !f) return '// constants and types';
  if (c && !t && !f) return '// constants';
  if (t && !c && !f) return '// types';
  if (c && f && !t) return '// constants and fixtures';
  return null; // mixed with fixtures + types — leave the author's wording
}

// --------------------------------------------------------------------------
const argv = process.argv.slice(2);
const fixArg = argv.find((a) => a.startsWith('--fix'));
const PASSES = fixArg
  ? fixArg.includes('=')
    ? fixArg.split('=')[1].split(',')
    : ['specifiers', 'dedupe', 'headers', 'order']
  : [];
const JSON_OUT = argv.includes('--json');
const maxArg = argv.find((a) => a.startsWith('--max-findings='));
const MAX = maxArg ? Number(maxArg.split('=')[1]) : 0;

const findings = [];
const changed = [];
const counts = { specifiers: 0, dedupe: 0, headers: 0, order: 0, multiline: 0 };

for (const file of walk(SRC)) {
  const relFile = path.relative(ROOT, file);
  if (GENERATED.has(relFile)) continue;
  const original = fs.readFileSync(file, 'utf8');
  let text = original;
  const fileDir = path.dirname(file);
  const record = (cat, extra) => findings.push({ file: relFile, cat, ...extra });

  // ---- pass: specifiers (whole-file, line-level; safe for statements after code)
  {
    const fileSrcRel = path.relative(SRC, file);
    const ownRoot = aliasFor(path.dirname(fileSrcRel));
    text = text.replace(/(^\s*(?:import|export)\b[^\n]*?from\s+)(['"])(\.[^'"]*)\2/gm, (whole, head, q, spec) => {
      const abs = path.resolve(fileDir, spec);
      const srcRel = path.relative(SRC, abs);
      if (srcRel.startsWith('..')) return whole;
      const target = aliasFor(srcRel);
      if (!target) return whole;
      if (isJson(spec)) return whole; // §5 — would become a rollup external
      // Only ../ specifiers are rewritten. A './x' reference — including the
      // package entry point's './forge', './constants', './types' barrels — is
      // idiomatic and stays as written.
      if (!spec.startsWith('..')) return whole;
      const sameRoot = ownRoot && target.alias === ownRoot.alias;
      record(sameRoot ? 'relativeUpSameRoot' : 'relativeCrossRoot', { spec, suggestion: target.suggestion });
      counts.specifiers++;
      return `${head}${q}${target.suggestion}${q}`;
    });
    if (!PASSES.includes('specifiers')) text = original;
  }

  // ---- structural passes operate on the leading header region
  const applyStructural = () => {
    const lines = text.split('\n');
    const region = parseHeaderRegion(lines);
    if (!region) return false;
    const sections = sectionize(region.items);
    let mutated = false;
    const rendered = [];

    for (const sec of sections) {
      let stmts = sec.stmts;
      const hasExportFrom = stmts.some((s) => s.kindWord === 'export');
      const guarded = sec.comments.some((c) => /prettier-ignore|eslint-disable|@ts-ignore|@ts-expect-error/.test(c));

      // dedupe: merge two single-line `import { a } from 'x'` of the same module
      if (!guarded && !hasExportFrom) {
        const bySpec = new Map();
        const merged = [];
        for (const s of stmts) {
          const key = s.specifier;
          const prev = bySpec.get(key);
          if (prev && prev.form === 'named' && s.form === 'named' && !prev.multiline && !s.multiline) {
            const names = (t) =>
              t
                .match(/^import\s*\{([^}]*)\}/)[1]
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
            const combined = [...names(prev.text), ...names(s.text)];
            const seenN = new Set();
            const uniq = combined.filter((n) => !seenN.has(n) && seenN.add(n));
            const line = `import { ${uniq.join(', ')} } from '${key}';`;
            if (line.length <= 120) {
              prev.text = line;
              prev.len = line.length;
              record('duplicateModule', { spec: key });
              counts.dedupe++;
              mutated = true;
              continue;
            }
          }
          if (!bySpec.has(key)) bySpec.set(key, s);
          merged.push(s);
        }
        stmts = merged;
      }

      // header comment normalisation / insertion
      let comments = sec.comments.slice();
      if (!guarded) {
        const want = sectionLabel(stmts);
        const isFirstSection = sections.indexOf(sec) === 0;
        if (want && !isFirstSection) {
          const existingIdx = comments.findIndex((c) => HEADER_RE.test(c));
          const existing = existingIdx >= 0 ? comments[existingIdx] : null;
          if (existing && existing !== want) {
            comments[existingIdx] = want;
            record('headerComment', { kind: 'nonstandard', from: existing, to: want });
            counts.headers++;
            mutated = true;
          } else if (!existing && !comments.length) {
            comments = [want];
            record('headerComment', { kind: 'missing', to: want });
            counts.headers++;
            mutated = true;
          }
        }
      }

      // ordering: single-line descending by length, multi-line last
      if (!guarded && !hasExportFrom && stmts.length > 1) {
        const proseComment = comments.some((c) => !HEADER_RE.test(c) && !CANONICAL_HEADERS.has(c));
        if (!proseComment) {
          const singles = stmts.filter((s) => !s.multiline);
          const multis = stmts.filter((s) => s.multiline);
          for (let k = 1; k < singles.length; k++)
            if (singles[k].len > singles[k - 1].len) {
              record('orderInversion', { spec: singles[k].specifier });
              counts.order++;
            }
          for (let k = 0; k < stmts.length; k++)
            if (stmts[k].multiline && stmts.slice(k + 1).some((x) => !x.multiline)) {
              record('multilineNotLast', { spec: stmts[k].specifier });
              counts.multiline++;
              break;
            }
          const sorted = [
            ...singles.slice().sort((a, b) => b.len - a.len || a.specifier.localeCompare(b.specifier)),
            ...multis.slice().sort((a, b) => b.len - a.len || a.specifier.localeCompare(b.specifier)),
          ];
          if (sorted.some((s, k) => s !== stmts[k])) {
            stmts = sorted;
            mutated = true;
          }
        }
      }

      if (rendered.length) rendered.push('');
      for (const c of comments) rendered.push(c);
      for (const s of stmts) rendered.push(s.text);
    }

    if (!mutated) return false;
    text = [...lines.slice(0, region.start), ...rendered, ...lines.slice(region.end + 1)].join('\n');
    return true;
  };

  const wantStructural = PASSES.some((p) => ['dedupe', 'headers', 'order'].includes(p));
  if (wantStructural || !PASSES.length) {
    const before = text;
    applyStructural();
    if (!wantStructural) text = before;
  }

  if (text !== original && PASSES.length) {
    fs.writeFileSync(file, text);
    changed.push(relFile);
  }
}

const byCat = {};
for (const f of findings) byCat[f.cat] = (byCat[f.cat] || 0) + 1;

if (JSON_OUT) {
  console.log(JSON.stringify({ total: findings.length, byCat, counts, changed, findings }, null, 2));
} else {
  console.log(PASSES.length ? `[imports] applied: ${PASSES.join(', ')}` : '[imports] report only');
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log(`  ${String(findings.length).padStart(5)}  TOTAL`);
  if (PASSES.length) console.log(`[imports] ${changed.length} files rewritten`);
}

if (!PASSES.length && findings.length > MAX) {
  console.error(`[imports] FAIL — ${findings.length} findings exceeds --max-findings=${MAX}`);
  process.exit(1);
}
