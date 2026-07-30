#!/usr/bin/env node
// attr-audit — deterministic AST attribute dictionary + typo / schema-divergence auditor.
//
// Walks a repo's source, extracts every object attribute / property name via the
// TypeScript AST (not regex), and surfaces:
//   1. TYPO CANDIDATES — a low-frequency name at edit-distance 1 from a much more
//      frequent name. Property-access / object-key / destructure occurrences are
//      the dangerous class (they silently evaluate to `undefined` → dead branch);
//      plain local-variable misspellings are reported separately as cosmetic.
//   2. SCHEMA DIVERGENCE (optional) — when --schema is supplied, attributes that
//      look canonical but are not present in the schema, and canonical names a
//      suspect is near.
//   3. WRITE-ONLY (optional, --write-only) — names set but never read. LOW PRECISION
//      (object spreads / cross-function returns / dynamic dispatch defeat a global
//      read-counter); secondary, read-each-one.
//   4. VALUE TYPOS (optional, needs --schema and/or --constants) — string *values*
//      declared in a string-literal type (`type X = 'ABANDONDED' | …`) or an enum
//      member (`ABANDONED = 'ABANDONDED'`) that are NOT in the canonical value vocab
//      (schema `enum` arrays + `export const X = '…'` values) but sit edit-distance 1
//      from a value that IS. This is a DIFFERENT class from #1: #1 catches misspelled
//      property *names*; #4 catches misspelled enum/status *values* that let a type
//      admit a string nothing produces, or make an enum emit the wrong string. The
//      property-name AST pass is blind to these because they are StringLiteral nodes,
//      not property identifiers (this is why `TournamentStatusUnion = 'ABANDONDED'`
//      survived a full property audit).
//   5. KEY/VALUE MISMATCH — in a "self-mapping enum" object (`export const X = { FOO:
//      'FOO', BAR: 'BAR', … } as const`, the pattern behind `type T = keyof typeof X`),
//      the KEY is declared identical to its string VALUE: the KEY becomes a union member
//      while the VALUE is what code emits. A KEY that differs from its own VALUE — most
//      often by CASE alone (`CURTIS_cONSOLATION: 'CURTIS_CONSOLATION'`) — silently
//      pollutes the `keyof typeof` union with a misspelled member. Passes #1 and #4 are
//      both blind to this: the CORRECT spelling appears only as a string VALUE (never as
//      a frequent property NAME, so #1 has no canonical), and the VALUE itself is
//      canonical (so #4 sees nothing wrong). This pass compares each key to its own value
//      inside self-mapping objects and flags case-only or edit-distance-1 divergence.
//
// This file is the CANONICAL source. It is:
//   - installed into each repo as `scripts/attr-audit.mjs` + a `pnpm attr-audit` script
//     (see Mentat/tools/attr-audit/install.mjs), and
//   - invoked cross-repo by Mentat/tools/attr-audit/run.mjs.
// Zero dependencies beyond the target repo's own `typescript`.
//
// Usage:
//   node attr-audit.mjs [--root DIR] [--src DIR]... [--exclude REGEX]...
//                       [--schema FILE]... [--types DIR]... [--constants DIR]...
//                       [--ignore NAME]... [--min-common N] [--ratio N] [--max-suspect N]
//                       [--write-only] [--json OUTDIR] [--ci] [--quiet]
//
// Config: flags override an optional `attr-audit.config.json` in --root. Shape:
//   { "src": ["src"], "exclude": ["/scratch/"], "schema": ["src/global/schema/x.json"],
//     "types": ["src/types"], "constants": ["src/constants"], "ignore": ["minute","weekday"],
//     "minCommon": 8, "ratio": 5, "maxSuspect": 3, "allow": ["knownName", ...] }
//
// Exit codes: 0 ok. With --ci: 1 if any PROP-class typo candidate is not in the
// allow-list (config.allow or attr-audit.allow.json in --root).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// ---------- arg parsing ----------
function parseArgs(argv) {
  const out = { src: [], exclude: [], schema: [], types: [], constants: [], ignore: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--root') out.root = next();
    else if (a === '--config') out.config = next();
    else if (a === '--src') out.src.push(next());
    else if (a === '--exclude') out.exclude.push(next());
    else if (a === '--schema') out.schema.push(next());
    else if (a === '--types') out.types.push(next());
    else if (a === '--constants') out.constants.push(next());
    else if (a === '--ignore') out.ignore.push(next());
    else if (a === '--min-common') out.minCommon = Number(next());
    else if (a === '--ratio') out.ratio = Number(next());
    else if (a === '--max-suspect') out.maxSuspect = Number(next());
    else if (a === '--json') out.json = next();
    else if (a === '--write-only') out.writeOnly = true;
    else if (a === '--extended') out.extended = true;
    else if (a === '--ci') out.ci = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!out.root && !a.startsWith('-')) out.root = a; // positional root
  }
  return out;
}

const HELP = `attr-audit — AST attribute dictionary + typo / schema-divergence auditor
  --root DIR         repo root (default: cwd)
  --config FILE      explicit config JSON (default: <root>/attr-audit.config.json)
  --src DIR          source dir(s) to walk, repeatable (default: src)
  --exclude REGEX    extra path-exclude regex(es), repeatable
  --schema FILE      JSON schema file(s) for canonical vocab, repeatable (optional)
  --types DIR        dir(s) of .ts type defs for canonical vocab, repeatable (optional)
  --constants DIR    dir(s) of const modules → canonical string-VALUE vocab, repeatable (optional)
  --ignore NAME      attribute name(s) / string value(s) to treat as known-legit, repeatable
  --min-common N     min frequency for a name to be a "canonical" comparison target (default 8)
  --ratio N          canonical must be >= N x more frequent than suspect (default 5)
  --max-suspect N    only names with total <= N are typo suspects (default 3)
  --write-only       also emit the (low-precision) write-only pool
  --extended         also emit orphan values, cross-enum near-pairs, dead schema values (informational)
  --json OUTDIR      write dictionary + report JSON to OUTDIR
  --ci               exit 1 if a PROP-class candidate is not allow-listed
  --quiet            suppress the console summary`;

// ---------- config resolution ----------
function loadConfig(root, explicitPath) {
  const p = explicitPath ? path.resolve(explicitPath) : path.join(root, 'attr-audit.config.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* ignore */ } }
  return {};
}
function loadAllow(root, cfg) {
  const set = new Set(cfg.allow || []);
  const p = path.join(root, 'attr-audit.allow.json');
  if (fs.existsSync(p)) { try { for (const n of JSON.parse(fs.readFileSync(p, 'utf8'))) set.add(n); } catch { /* ignore */ } }
  return set;
}

// ---------- typescript resolution (prefer target repo's copy) ----------
async function loadTypeScript(root) {
  const candidates = [
    path.join(root, 'node_modules', 'typescript'),
    path.join(path.dirname(new URL(import.meta.url).pathname), 'node_modules', 'typescript'),
  ];
  for (const c of candidates) {
    const entry = path.join(c, 'lib', 'typescript.js');
    if (fs.existsSync(entry)) return (await import(pathToFileURL(entry).href)).default;
  }
  // last resort: node resolution from this file
  try {
    const require = createRequire(import.meta.url);
    return require('typescript');
  } catch {
    throw new Error(`Could not resolve "typescript". Install it in ${root} (pnpm install) or run from a repo that has it.`);
  }
}

// ---------- file walk ----------
function walk(dir, excludeRe, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      if (excludeRe.some((re) => re.test(full + '/'))) continue;
      walk(full, excludeRe, acc);
    } else if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(e.name)) {
      if (/\.d\.ts$/.test(e.name)) continue;
      if (excludeRe.some((re) => re.test(full))) continue;
      acc.push(full);
    }
  }
  return acc;
}

// ---------- schema / type vocab ----------
function collectSchemaProps(files, root) {
  const props = new Set();
  for (const rel of files) {
    const p = path.isAbsolute(rel) ? rel : path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    const recurse = (o) => {
      if (!o || typeof o !== 'object') return;
      if (o.properties && typeof o.properties === 'object' && !Array.isArray(o.properties)) {
        for (const k of Object.keys(o.properties)) props.add(k);
      }
      for (const v of Object.values(o)) recurse(v);
    };
    recurse(json);
  }
  return props;
}
// Provenance-tracking merge helper: value -> Set(sourceLabel). Provenance lets the
// cross-enum pass tell "two spellings from different origins" (COMPLETE in schema,
// COMPLETED in a const module) apart from a deliberate singular/plural pair defined
// in the same file.
function addProv(map, value, source) {
  let s = map.get(value);
  if (!s) { s = new Set(); map.set(value, s); }
  s.add(source);
}

// Canonical string VALUES from JSON schema: every string member of an `enum`
// array and any `const` string keyword. These are the authoritative allowable
// values a status/type field may hold. Returns value -> Set('schema:<file>').
function collectSchemaEnumValues(files, root) {
  const prov = new Map();
  for (const rel of files) {
    const p = path.isAbsolute(rel) ? rel : path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    const label = `schema:${path.basename(rel)}`;
    const recurse = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.enum)) for (const v of o.enum) if (typeof v === 'string') addProv(prov, v, label);
      if (typeof o.const === 'string') addProv(prov, o.const, label);
      for (const v of Object.values(o)) recurse(v);
    };
    recurse(json);
  }
  return prov;
}

// Canonical string VALUES from constants modules: the RHS of `const X = '…'`
// declarations and string values in exported object literals / enum members.
// These plus the schema enum values form the value vocab that literal-type and
// enum-member string values are checked against. Returns value -> Set('const:<file>').
function collectConstantValues(ts, dirs, root, excludeRe) {
  const prov = new Map();
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    const files = fs.statSync(abs).isDirectory() ? walk(abs, excludeRe) : [abs];
    for (const f of files) {
      if (!/\.tsx?$/.test(f)) continue;
      const label = `const:${path.relative(root, f)}`;
      const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (n) => {
        if (ts.isVariableDeclaration(n) && n.initializer && ts.isStringLiteral(n.initializer)) addProv(prov, n.initializer.text, label);
        else if (ts.isPropertyAssignment(n) && n.initializer && ts.isStringLiteral(n.initializer)) addProv(prov, n.initializer.text, label);
        else if (ts.isEnumMember(n) && n.initializer && ts.isStringLiteral(n.initializer)) addProv(prov, n.initializer.text, label);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return prov;
}

function collectTypeProps(ts, dirs, root, excludeRe) {
  const props = new Set();
  for (const d of dirs) {
    const abs = path.isAbsolute(d) ? d : path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    const files = fs.statSync(abs).isDirectory() ? walk(abs, excludeRe) : [abs];
    for (const f of files) {
      if (!/\.tsx?$/.test(f)) continue;
      const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (n) => {
        if ((ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) && n.name && ts.isIdentifier(n.name)) props.add(n.name.text);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return props;
}

// ---------- extraction ----------
function extract(ts, files, root) {
  const usage = new Map();     // name -> {total,writes,reads}
  const funcValued = new Set();
  const occ = new Map();       // name -> [{file,line,kind}]
  const bump = (name, isWrite) => {
    let e = usage.get(name);
    if (!e) { e = { total: 0, writes: 0, reads: 0 }; usage.set(name, e); }
    e.total++; if (isWrite) e.writes++; else e.reads++;
  };
  const addOcc = (name, file, node, sf, kind) => {
    if (!occ.has(name)) occ.set(name, []);
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    occ.get(name).push({ file, line: line + 1, kind });
  };
  for (const file of files) {
    const rel = path.relative(root, file);
    let sf;
    try { sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); } catch { continue; }
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && node.name && ts.isIdentifier(node.name)) {
        const n = node.name.text; bump(n, true); addOcc(n, rel, node.name, sf, 'objectKey');
        const init = node.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) funcValued.add(n);
      } else if (ts.isShorthandPropertyAssignment(node) && node.name) {
        bump(node.name.text, true); addOcc(node.name.text, rel, node.name, sf, 'shorthandKey');
      } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        funcValued.add(node.name.text);
      } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
        const p = node.parent;
        const isWrite = p && ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        bump(node.name.text, isWrite); addOcc(node.name.text, rel, node.name, sf, isWrite ? 'propAssign' : 'propRead');
      } else if (ts.isBindingElement(node)) {
        const pn = node.propertyName && ts.isIdentifier(node.propertyName) ? node.propertyName
          : (node.name && ts.isIdentifier(node.name) ? node.name : null);
        if (pn) { bump(pn.text, false); addOcc(pn.text, rel, pn, sf, 'destructure'); }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { usage, funcValued, occ };
}

// Collect every string *value*, tagged by context:
//   'literalType' — `'FOO'` inside a LiteralTypeNode (union member / discriminant)
//   'enumMember'  — a string-initialized enum member
//   'expr'        — a string literal in expression position (assignment, comparison,
//                   object value, call arg, return). The property audit never sees any
//                   of these — they are StringLiteral nodes, not property identifiers.
// For type/enum contexts we also record the owning declaration name (the enum / type
// alias / interface the value belongs to) so orphan and cross-enum output can name it.
function extractStringValues(ts, files, root) {
  const occ = new Map(); // value -> [{file,line,ctx,owner}]
  const add = (value, file, node, sf, ctx, owner) => {
    if (!occ.has(value)) occ.set(value, []);
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    occ.get(value).push({ file, line: line + 1, ctx, owner });
  };
  const ownerName = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if ((ts.isEnumDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) && p.name) return p.name.text;
      if (ts.isPropertySignature(p) && p.name && ts.isIdentifier(p.name)) return p.name.text;
    }
    return undefined;
  };
  for (const file of files) {
    const rel = path.relative(root, file);
    let sf;
    try { sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); } catch { continue; }
    const visit = (node) => {
      if (ts.isStringLiteral(node)) {
        const p = node.parent;
        if (p && ts.isLiteralTypeNode(p)) add(node.text, rel, node, sf, 'literalType', ownerName(node));
        else if (p && ts.isEnumMember(p) && p.initializer === node) add(node.text, rel, node, sf, 'enumMember', ownerName(node));
        else add(node.text, rel, node, sf, 'expr');
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return occ;
}

const ENUM_SHAPE = /^[A-Z][A-Z0-9_.]{3,}$/; // SCREAMING_SNAKE / DOTTED, length >= 4

// ---------- Damerau-Levenshtein (capped) ----------
function dl(a, b) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > 2) return 3;
  const d = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) for (let j = 1; j <= bl; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[al][bl];
}

const PROP_KINDS = new Set(['propRead', 'propAssign', 'objectKey', 'shorthandKey', 'destructure']);
const DANGEROUS_KINDS = new Set(['propRead', 'propAssign', 'objectKey']);

function detectTypos(usage, occ, opts, schemaProps, ignore) {
  const attrs = [...usage.entries()].map(([name, e]) => ({ name, ...e }));
  const common = attrs.filter((a) => a.total >= opts.minCommon && a.name.length >= 5).map((a) => a.name);
  const commonSet = new Set(common);
  const candidates = [];
  for (const a of attrs) {
    if (a.total > opts.maxSuspect || a.name.length < 5) continue;
    if (ignore.has(a.name)) continue;
    if (commonSet.has(a.name)) continue;
    let best = null;
    for (const c of common) {
      if (c === a.name) { best = null; break; }
      if (dl(a.name, c) === 1) {
        const ce = usage.get(c);
        if (ce && ce.total >= a.total * opts.ratio && (!best || ce.total > best.total)) best = { name: c, total: ce.total };
      }
    }
    if (!best) continue;
    const kinds = (occ.get(a.name) || []).map((o) => o.kind);
    const isProp = kinds.some((k) => DANGEROUS_KINDS.has(k)) ||
      (kinds.every((k) => k === 'destructure') && false); // destructure-only counted as var below
    const dangerous = kinds.some((k) => DANGEROUS_KINDS.has(k));
    const primary = (occ.get(a.name) || []).find((o) => DANGEROUS_KINDS.has(o.kind)) || (occ.get(a.name) || [])[0] || {};
    candidates.push({
      suspect: a.name, total: a.total, writes: a.writes, reads: a.reads,
      canonical: best.name, canonicalTotal: best.total,
      dangerous, klass: dangerous ? 'PROP' : 'var',
      canonicalInSchema: schemaProps ? schemaProps.has(best.name) : null,
      suspectInSchema: schemaProps ? schemaProps.has(a.name) : null,
      at: `${primary.file}:${primary.line}`, kind: primary.kind,
    });
  }
  candidates.sort((x, y) => (x.dangerous === y.dangerous ? 0 : x.dangerous ? -1 : 1) || x.total - y.total || y.canonicalTotal - x.canonicalTotal);
  return candidates;
}

function detectWriteOnly(usage, funcValued, occ, ignore) {
  const out = [];
  for (const [name, e] of usage) {
    if (e.reads !== 0 || e.writes < 1 || name.length < 4) continue;
    if (funcValued.has(name) || ignore.has(name)) continue;
    const primary = (occ.get(name) || [])[0] || {};
    out.push({ name, writes: e.writes, at: `${primary.file}:${primary.line}`, kind: primary.kind });
  }
  out.sort((a, b) => a.writes - b.writes || a.name.localeCompare(b.name));
  return out;
}

const TYPE_CTX = new Set(['literalType', 'enumMember']);

// Value-typo detection. A suspect string value declared in a literal type / enum
// member that is NOT in the canonical value vocab but is edit-distance 1 from a
// value that IS. The canonical vocab (schema enums + const values) is treated as
// authoritative, so — unlike property typos — no frequency ratio is required: a
// near-miss of a canonical value is high-confidence regardless of how often it
// appears (a typo'd union member often appears exactly once).
function detectValueTypos(stringOcc, canonicalValues, ignore, allow) {
  if (!canonicalValues || !canonicalValues.size) return [];
  const canon = [...canonicalValues].filter((v) => v.length >= 4);
  const out = [];
  for (const [value, all] of stringOcc) {
    const occs = all.filter((o) => TYPE_CTX.has(o.ctx));
    if (!occs.length || value.length < 4) continue;
    if (canonicalValues.has(value)) continue; // declared value matches the vocab — fine
    if (ignore.has(value) || allow.has(value)) continue;
    let best = null;
    for (const c of canon) {
      if (c === value) { best = null; break; }
      if (dl(value, c) === 1 && (!best || c < best)) best = c;
    }
    if (!best) continue;
    const primary = occs[0] || {};
    out.push({
      suspect: value, canonical: best, count: occs.length,
      ctx: [...new Set(occs.map((o) => o.ctx))].join(','),
      at: `${primary.file}:${primary.line}`,
      occurrences: occs.map((o) => `${o.file}:${o.line}`),
    });
  }
  out.sort((a, b) => a.suspect.localeCompare(b.suspect));
  return out;
}

// (A) Expression-value typos. A string literal in EXPRESSION position (assignment,
// comparison, object value, arg) that is enum-shaped, not canonical, and edit-distance
// 1 from an enum-shaped canonical value. This is the class that hid
// `draftState.status = 'COMPLETE'` from every other pass: it is neither a property
// name nor a literal-type node, just a bare string in code. Restricting BOTH the
// suspect and the target to ENUM_SHAPE keeps prose/message/camelCase strings out.
function detectExpressionValueTypos(stringOcc, canonicalValues, ignore, allow, alreadyFlagged) {
  if (!canonicalValues || !canonicalValues.size) return [];
  const targets = [...canonicalValues].filter((v) => ENUM_SHAPE.test(v));
  const out = [];
  for (const [value, all] of stringOcc) {
    if (!ENUM_SHAPE.test(value) || canonicalValues.has(value)) continue;
    if (ignore.has(value) || allow.has(value) || alreadyFlagged.has(value)) continue;
    const occs = all.filter((o) => o.ctx === 'expr');
    if (!occs.length) continue;
    let best = null;
    for (const c of targets) {
      if (c === value) { best = null; break; }
      if (dl(value, c) === 1 && (!best || c < best)) best = c;
    }
    if (!best) continue;
    const primary = occs[0] || {};
    out.push({
      suspect: value, canonical: best, count: occs.length,
      at: `${primary.file}:${primary.line}`,
      occurrences: occs.map((o) => `${o.file}:${o.line}`),
    });
  }
  out.sort((a, b) => a.suspect.localeCompare(b.suspect));
  return out;
}

// (B) Orphan / dead union values. A value declared in a literal type or enum member
// that no code ever PRODUCES (zero expression-position occurrences). Informational:
// a shared type library legitimately declares values populated only by external data
// (e.g. `drawStatus` set by an ingest pipeline), so "no in-repo producer" is a lead,
// not a verdict. Most useful in application repos and for spotting aspirational enums.
function detectOrphanValues(stringOcc, ignore) {
  const out = [];
  for (const [value, all] of stringOcc) {
    if (value.length < 4 || ignore.has(value)) continue;
    const decls = all.filter((o) => TYPE_CTX.has(o.ctx));
    if (!decls.length) continue;
    if (all.some((o) => o.ctx === 'expr')) continue; // produced somewhere → not orphan
    const owners = [...new Set(decls.map((o) => o.owner).filter(Boolean))];
    const primary = decls[0];
    out.push({ value, owners, ctx: [...new Set(decls.map((o) => o.ctx))].join(','), at: `${primary.file}:${primary.line}` });
  }
  out.sort((a, b) => (a.owners[0] || '').localeCompare(b.owners[0] || '') || a.value.localeCompare(b.value));
  return out;
}

// (C) Cross-enum consistency. Two canonical, enum-shaped values that are edit-distance
// 1 of each other AND come from DIFFERENT origins (disjoint provenance) — a strong hint
// that one concept has two spellings (COMPLETE in the draw schema vs COMPLETED for
// matchUps). Same-origin near-neighbours (deliberate singular/plural in one const file)
// are excluded by the disjoint-provenance test. Informational / review list.
function detectCrossEnumPairs(canonicalProv, ignore, allow) {
  const vals = [...canonicalProv.keys()].filter((v) => ENUM_SHAPE.test(v)).sort();
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      const a = vals[i], b = vals[j];
      if (Math.abs(a.length - b.length) > 1) continue;
      if (ignore.has(a) || ignore.has(b) || allow.has(a) || allow.has(b)) continue;
      if (dl(a, b) !== 1) continue;
      const sa = canonicalProv.get(a), sb = canonicalProv.get(b);
      const disjoint = ![...sa].some((s) => sb.has(s));
      if (!disjoint) continue;
      out.push({ a, b, sourcesA: [...sa], sourcesB: [...sb] });
    }
  }
  return out;
}

// (D) Reverse value schema-divergence. Schema `enum` values that appear NOWHERE in the
// scanned code (no literal type, enum member, or expression). Either a dead schema
// entry or a value only ever supplied by external data — worth a look when trimming or
// reconciling the published contract. Informational.
function detectDeadSchemaValues(schemaProv, stringOcc, ignore) {
  if (!schemaProv || !schemaProv.size) return [];
  const out = [];
  for (const [value, sources] of schemaProv) {
    if (value.length < 3 || ignore.has(value)) continue;
    if (stringOcc.has(value)) continue; // referenced somewhere in code
    out.push({ value, sources: [...sources] });
  }
  out.sort((a, b) => a.value.localeCompare(b.value));
  return out;
}

// (E) Key/value mismatch in self-mapping enum objects. Object literals of the form
// `{ FOO: 'FOO', BAR: 'BAR', … }` — the shape behind `export const X = {…} as const;
// type T = keyof typeof X` — are declared so each KEY equals its string VALUE. A KEY
// that differs from its own VALUE, especially by CASE alone (`CURTIS_cONSOLATION:
// 'CURTIS_CONSOLATION'`), poisons the `keyof typeof` union with a member no producer
// emits. To keep precision high we only inspect objects that are actually self-mapping
// enums (>= MIN_SELFMAP identical key/value pairs), then within them flag a key that
// (a) matches its value case-insensitively but not exactly — a pure capitalization
// typo, the highest-confidence class — or (b) is enum-shaped and edit-distance 1 from
// its value. Keys equal to their value, or far from it (a deliberate short-key → long-
// value map), are never flagged. Config keys use the same allow/ignore lists as #1.
const MIN_SELFMAP = 2;
function keyText(ts, name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}
function detectKeyValueMismatch(ts, files, root, ignore, allow) {
  const out = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    let sf;
    try { sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); } catch { continue; }
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const pairs = [];
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop) || !prop.initializer || !ts.isStringLiteral(prop.initializer)) continue;
          const key = keyText(ts, prop.name);
          if (key !== null) pairs.push({ key, value: prop.initializer.text, nameNode: prop.name });
        }
        const selfMap = pairs.filter((p) => p.key === p.value).length;
        if (selfMap >= MIN_SELFMAP) {
          for (const p of pairs) {
            if (p.key === p.value || ignore.has(p.key) || allow.has(p.key)) continue;
            const caseOnly = p.key.toUpperCase() === p.value.toUpperCase();
            const near = ENUM_SHAPE.test(p.value) && dl(p.key, p.value) === 1;
            if (!caseOnly && !near) continue;
            const { line } = sf.getLineAndCharacterOfPosition(p.nameNode.getStart(sf));
            out.push({ suspect: p.key, canonical: p.value, klass: caseOnly ? 'case' : 'near', at: `${rel}:${line + 1}` });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  out.sort((a, b) => a.suspect.localeCompare(b.suspect));
  return out;
}

// ---------- main ----------
async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) { console.log(HELP); return 0; }
  const root = path.resolve(cli.root || process.cwd());
  const cfg = loadConfig(root, cli.config);
  const opts = {
    src: (cli.src.length ? cli.src : cfg.src) || ['src'],
    exclude: [...(cfg.exclude || []), ...cli.exclude],
    schema: cli.schema.length ? cli.schema : (cfg.schema || []),
    types: cli.types.length ? cli.types : (cfg.types || []),
    constants: cli.constants.length ? cli.constants : (cfg.constants || []),
    ignore: new Set([...(cfg.ignore || []), ...cli.ignore]),
    minCommon: cli.minCommon ?? cfg.minCommon ?? 8,
    ratio: cli.ratio ?? cfg.ratio ?? 5,
    maxSuspect: cli.maxSuspect ?? cfg.maxSuspect ?? 3,
    writeOnly: cli.writeOnly ?? false,
    extended: cli.extended ?? cfg.extended ?? false,
    json: cli.json,
    ci: cli.ci ?? false,
    quiet: cli.quiet ?? false,
  };
  const allow = loadAllow(root, cfg);

  const DEFAULT_EXCLUDES = ['/tests/', '\\.test\\.', '\\.spec\\.', '/node_modules/', '/dist/', '/build/', '/coverage/'];
  const excludeRe = [...DEFAULT_EXCLUDES, ...opts.exclude].map((s) => new RegExp(s));

  const ts = await loadTypeScript(root);

  const files = [];
  for (const s of opts.src) {
    const abs = path.isAbsolute(s) ? s : path.join(root, s);
    walk(abs, excludeRe, files);
  }
  if (!files.length) { console.error(`attr-audit: no source files under ${opts.src.join(', ')} in ${root}`); return 2; }

  const schemaProps = opts.schema.length ? collectSchemaProps(opts.schema, root) : null;
  const typeProps = opts.types.length ? collectTypeProps(ts, opts.types, root, excludeRe) : null;
  const canonical = schemaProps || typeProps
    ? new Set([...(schemaProps || []), ...(typeProps || [])])
    : null;

  const { usage, funcValued, occ } = extract(ts, files, root);
  const typos = detectTypos(usage, occ, opts, canonical, opts.ignore);
  const keyValueMismatch = detectKeyValueMismatch(ts, files, root, opts.ignore, allow);
  const writeOnly = opts.writeOnly ? detectWriteOnly(usage, funcValued, occ, opts.ignore) : [];

  // Value passes: canonical string values = schema enums + const-module values, with
  // provenance so the cross-enum pass can tell different origins apart.
  const schemaValues = opts.schema.length ? collectSchemaEnumValues(opts.schema, root) : null;
  const constantValues = opts.constants.length ? collectConstantValues(ts, opts.constants, root, excludeRe) : null;
  let canonicalProv = null, canonicalValues = null;
  if (schemaValues || constantValues) {
    canonicalProv = new Map();
    for (const src of [schemaValues, constantValues]) {
      if (!src) continue;
      for (const [v, sources] of src) for (const s of sources) addProv(canonicalProv, v, s);
    }
    canonicalValues = new Set(canonicalProv.keys());
  }
  const stringOcc = extractStringValues(ts, files, root);
  const valueTypos = detectValueTypos(stringOcc, canonicalValues, opts.ignore, allow);
  const flagged = new Set(valueTypos.map((t) => t.suspect));
  const exprValueTypos = detectExpressionValueTypos(stringOcc, canonicalValues, opts.ignore, allow, flagged);
  const orphanValues = opts.extended ? detectOrphanValues(stringOcc, opts.ignore) : [];
  const crossEnum = opts.extended && canonicalProv ? detectCrossEnumPairs(canonicalProv, opts.ignore, allow) : [];
  const deadSchema = opts.extended && schemaValues ? detectDeadSchemaValues(schemaValues, stringOcc, opts.ignore) : [];

  const dictionary = [...usage.entries()]
    .map(([name, e]) => ({ name, ...e, inSchema: canonical ? canonical.has(name) : null }))
    .sort((a, b) => b.total - a.total);

  if (opts.json) {
    fs.mkdirSync(opts.json, { recursive: true });
    fs.writeFileSync(path.join(opts.json, 'attr-dictionary.json'), JSON.stringify(dictionary, null, 2));
    fs.writeFileSync(path.join(opts.json, 'attr-report.json'), JSON.stringify({
      root, files: files.length, distinctAttributes: usage.size,
      schemaProps: schemaProps ? schemaProps.size : 0, typeProps: typeProps ? typeProps.size : 0,
      canonicalValues: canonicalValues ? canonicalValues.size : 0,
      typoCandidates: typos, keyValueMismatchCandidates: keyValueMismatch,
      valueTypoCandidates: valueTypos,
      expressionValueTypoCandidates: exprValueTypos,
      orphanValues, crossEnumPairs: crossEnum, deadSchemaValues: deadSchema,
      writeOnly,
    }, null, 2));
  }

  const propCandidates = typos.filter((t) => t.dangerous);
  const varCandidates = typos.filter((t) => !t.dangerous);
  const unallowedProp = propCandidates.filter((t) => !allow.has(t.suspect));
  const unallowedValue = [...valueTypos, ...exprValueTypos].filter((t) => !allow.has(t.suspect));
  const unallowedKeyValue = keyValueMismatch.filter((t) => !allow.has(t.suspect));

  if (!opts.quiet) {
    console.log(`\nattr-audit  ${path.basename(root)}`);
    console.log(`  files: ${files.length}  |  distinct attributes: ${usage.size}` +
      (canonical ? `  |  canonical vocab: ${canonical.size}` : ''));
    console.log(`  typo candidates: ${typos.length}  (PROP/dangerous: ${propCandidates.length}, var/cosmetic: ${varCandidates.length})`);
    console.log(`  key/value mismatch candidates: ${keyValueMismatch.length}  (self-mapping enum key ≠ its own value)`);
    if (canonicalValues) console.log(`  value vocab: ${canonicalValues.size}  |  VALUE typo candidates: ${valueTypos.length} (type/enum) + ${exprValueTypos.length} (expression)`);
    if (opts.extended && canonicalValues) console.log(`  orphan values: ${orphanValues.length}  |  cross-enum near-pairs: ${crossEnum.length}  |  dead schema values: ${deadSchema.length}`);
    if (opts.writeOnly) console.log(`  write-only (low precision): ${writeOnly.length}`);
    console.log(`\n  === PROP-class typo candidates (dead-branch / divergence risk) ===`);
    if (!propCandidates.length) console.log('    (none)');
    for (const t of propCandidates) {
      const flag = allow.has(t.suspect) ? ' [allow]' : '';
      const sch = t.canonicalInSchema ? ' {canon∈schema}' : '';
      console.log(`    ${t.suspect} (x${t.total} w${t.writes}/r${t.reads}) ~ ${t.canonical} (x${t.canonicalTotal})${sch}  @ ${t.at} ${t.kind || ''}${flag}`);
    }
    console.log(`\n  === KEY/VALUE mismatch candidates (self-mapping enum key ≠ its own value — case/near typo) ===`);
    if (!keyValueMismatch.length) console.log('    (none)');
    for (const t of keyValueMismatch) {
      const flag = allow.has(t.suspect) ? ' [allow]' : '';
      console.log(`    ${t.suspect}: '${t.canonical}'  (${t.klass})  @ ${t.at}${flag}`);
    }
    if (canonicalValues) {
      console.log(`\n  === ENUM / LITERAL-VALUE typo candidates (type admits a value nothing produces) ===`);
      if (!valueTypos.length) console.log('    (none)');
      for (const t of valueTypos) {
        const flag = allow.has(t.suspect) ? ' [allow]' : '';
        console.log(`    '${t.suspect}' ~ '${t.canonical}'  (${t.ctx}, x${t.count})  @ ${t.at}${flag}`);
      }
      console.log(`\n  === EXPRESSION-VALUE typo candidates (bare string literal near an enum value) ===`);
      if (!exprValueTypos.length) console.log('    (none)');
      for (const t of exprValueTypos) {
        const flag = allow.has(t.suspect) ? ' [allow]' : '';
        console.log(`    '${t.suspect}' ~ '${t.canonical}'  (expr, x${t.count})  @ ${t.at}${flag}`);
      }
    }
    if (opts.extended && canonicalValues) {
      console.log(`\n  === orphan values (declared in a type/enum, never produced in code) [informational] ===`);
      if (!orphanValues.length) console.log('    (none)');
      for (const o of orphanValues.slice(0, 40)) {
        console.log(`    '${o.value}'  ${o.owners.length ? `in ${o.owners.join('/')}` : ''}  (${o.ctx})  @ ${o.at}`);
      }
      if (orphanValues.length > 40) console.log(`    … ${orphanValues.length - 40} more (see --json)`);
      console.log(`\n  === cross-enum near-pairs (one concept, two spellings across origins) [informational] ===`);
      if (!crossEnum.length) console.log('    (none)');
      for (const p of crossEnum.slice(0, 40)) {
        console.log(`    '${p.a}' ~ '${p.b}'   [${p.sourcesA.join(',')}] vs [${p.sourcesB.join(',')}]`);
      }
      if (crossEnum.length > 40) console.log(`    … ${crossEnum.length - 40} more (see --json)`);
      console.log(`\n  === dead schema values (schema enum value with no code reference) [informational] ===`);
      if (!deadSchema.length) console.log('    (none)');
      for (const d of deadSchema.slice(0, 40)) {
        console.log(`    '${d.value}'   [${d.sources.join(',')}]`);
      }
      if (deadSchema.length > 40) console.log(`    … ${deadSchema.length - 40} more (see --json)`);
    }
    if (varCandidates.length) {
      console.log(`\n  === var/cosmetic candidates (local-variable misspellings) ===`);
      for (const t of varCandidates.slice(0, 40)) {
        console.log(`    ${t.suspect} (x${t.total}) ~ ${t.canonical} (x${t.canonicalTotal})  @ ${t.at}`);
      }
      if (varCandidates.length > 40) console.log(`    … ${varCandidates.length - 40} more`);
    }
    if (opts.json) console.log(`\n  JSON written to ${opts.json}/`);
  }

  if (opts.ci && (unallowedProp.length || unallowedValue.length || unallowedKeyValue.length)) {
    if (unallowedProp.length) {
      console.error(`\nattr-audit: ${unallowedProp.length} PROP-class typo candidate(s) not in allow-list:`);
      for (const t of unallowedProp) console.error(`  - ${t.suspect} ~ ${t.canonical}  @ ${t.at}`);
    }
    if (unallowedKeyValue.length) {
      console.error(`\nattr-audit: ${unallowedKeyValue.length} KEY/VALUE mismatch candidate(s) not in allow-list:`);
      for (const t of unallowedKeyValue) console.error(`  - ${t.suspect}: '${t.canonical}' (${t.klass})  @ ${t.at}`);
    }
    if (unallowedValue.length) {
      console.error(`\nattr-audit: ${unallowedValue.length} ENUM/LITERAL-VALUE typo candidate(s) not in allow-list:`);
      for (const t of unallowedValue) console.error(`  - '${t.suspect}' ~ '${t.canonical}'  @ ${t.at}`);
    }
    console.error(`\nAdd intentional names/values to attr-audit.allow.json (or config.allow) to accept them.`);
    return 1;
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => { console.error('attr-audit:', err.message); process.exit(2); });
