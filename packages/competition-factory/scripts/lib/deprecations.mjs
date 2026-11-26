/**
 * The `@deprecated` tags the published declarations carry, and where they go.
 *
 * WHY THIS EXISTS. `tsconfig.base.json` sets `removeComments: true` and rollup-plugin-dts honours it, so no doc
 * comment written in `src/` reaches a consumer's editor. Keeping comments would double the gzipped declarations, and
 * TypeScript ignores a tag on a source function when the name is reached through `export { x } from` (every governor
 * member and engine method is). So the tags are INJECTED into the built declarations by `postbuild.mjs`, at the
 * places a consumer meets each name:
 *
 *   governor   the export specifier of a governor namespace member (`drawsGovernor.addGoesTo`,
 *              `drawsGovernor.query.addGoesTo`, `governors.drawsGovernor.addGoesTo`, the governors subpath)
 *   engine     the `MethodSignatures` entry, which types `tournamentEngine` / `competitionEngine` methods
 *   utilities  the root export specifier of `utilities`, the deprecated alias of `tools`
 *   alias      the five long-deprecated aliases tagged in source (`ALIASES` below)
 *
 * A tag on the export specifier, not on the declaration, so a function that is also exported elsewhere
 * (`tools.formats.parse`, the root `toStatObjects`) stays untagged there.
 *
 * WHAT IS TAGGED is read, never listed here: every `engineDisposition: "scheduled-for-removal"` route of
 * `documentation/engine-api-transition.json` (in the governors that row names), and every name of the positional
 * guard list `src/tests/governors/positionalGovernorFunctions.ts` (in every governor that holds it). Only the alias
 * list is fixed, because those names have no manifest.
 *
 * `verify:deprecations` counts the tags in the PACKED declarations against `planDeprecations` and runs an editor
 * probe; `generateMethodSignatures.mjs` writes the same engine messages into `src/` for in-repo editors.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GUIDE = 'https://courthive.github.io/competition-factory/docs/migration-8.0.0';
export const ANCHORS = {
  routes: `${GUIDE}#governor-and-engine-route-removals`,
  positional: `${GUIDE}#stateless-functions-move-to-tools`,
  utilities: `${GUIDE}#utilities-is-removed`,
  aliases: `${GUIDE}#removed-options-constants-and-fields`,
};
export const MANIFEST_PATH = 'documentation/engine-api-transition.json';
export const GUARD_PATH = 'src/tests/governors/positionalGovernorFunctions.ts';

/** Where each positional guard group is going; `parseMatchUpFormat` / `stringifyMatchUpFormat` are score-governor copies. */
const GUARD_DESTINATIONS = {
  availability: (name) => `availability.${name}`,
  formats: (name) =>
    `tools.formats.${{ parseMatchUpFormat: 'parse', stringifyMatchUpFormat: 'stringify' }[name] ?? name}`,
  scoring: (name) => `tools.scoring.${name}`,
  publishing: (name) => `tools.publishing.${name}`,
  entries: (name) => `tools.entries.${name}`,
  draws: (name) => `tools.draws.${name}`,
  matchUps: (name) => `tools.matchUps.${name}`,
  retiring: () => 'the getPublishState query',
};

/**
 * The five long-deprecated aliases (six names), as the built declarations hold them: `container` is the top-level
 * declaration (rollup may suffix it `$n`), `member` the property or namespace member inside it, or absent when the
 * container itself is the alias. `files` are the bundles that declare it. The messages repeat the source tags.
 */
export const ALIASES = [
  {
    alias: 'getNotices',
    container: 'globalState',
    member: 'getNotices',
    files: ['root'],
    message: `Use \`getPayloads\`; removed in 8.0.0 (${ANCHORS.aliases})`,
  },
  {
    alias: 'notices',
    container: 'CallListenerArgs',
    member: 'notices',
    files: ['root'],
    message: `Alias for \`payloads\`, kept for pre-5.0.0 providers; removed in 8.0.0 (${ANCHORS.aliases})`,
  },
  {
    alias: 'SCHEDULE_METHOD',
    container: 'matchUpActionConstants',
    member: 'SCHEDULE_METHOD',
    files: ['root', 'constants'],
    message: `The method of SCORE, CLEAR_SCORE and EXIT, misnamed: use \`SCORE_METHOD\`; removed in 8.0.0 (${ANCHORS.aliases})`,
  },
  ...['PositionActionsArgs', 'MatchUpActionsArgs'].map((container) => ({
    alias: 'restrictAdHocRoundParticipants',
    container,
    member: 'restrictAdHocRoundParticipants',
    files: ['root'],
    message: `No effect: a participant already in an AD_HOC round is never offered for it; removed in 8.0.0 (${ANCHORS.aliases})`,
  })),
  {
    alias: 'eventInfo',
    container: 'getTournamentInfo',
    member: 'eventInfo',
    files: ['root'],
    message: `Never returned: the events are listed on \`tournamentInfo.eventInfo\`; removed in 8.0.0 (${ANCHORS.aliases})`,
  },
  {
    alias: 'EntryFee',
    container: 'EntryFee',
    files: ['root'],
    message: `Use \`RegistrationEntryFee\`, which this aliases; removed in 8.0.0 (${ANCHORS.aliases})`,
  },
];

export const UTILITIES_MESSAGE = `Alias of \`tools\`; removed in 8.0.0: replace \`utilities.\` with \`tools.\` (${ANCHORS.utilities})`;

const code = (path) => (/^[\w$.]+$/.test(path) ? `\`${path}\`` : path);

/** One route's replacement, as the manifest records it: a path, a sentence, or several named routes. */
function describeReplacement(replacement) {
  if (replacement == null) return undefined;
  if (typeof replacement === 'string') return code(replacement);
  return `one of: ${Object.values(replacement).map(code).join(' | ')}`;
}

/** The positional guard list, read as text: `{ group: [names] }`, multi-line and one-line arrays alike. */
export function readGuardList(text) {
  const body = text.slice(text.indexOf('POSITIONAL_GOVERNOR_FUNCTIONS'));
  const groups = {};
  for (const [, group, list] of body.matchAll(/^\s+(\w+): \[([^\]]*)\]/gm))
    groups[group] = [...list.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  if (!Object.keys(groups).length) throw new Error(`no groups read from ${GUARD_PATH}`);
  const unknown = Object.keys(groups).filter((g) => !GUARD_DESTINATIONS[g]);
  if (unknown.length) throw new Error(`${GUARD_PATH}: no destination for group(s) ${unknown.join(', ')}`);
  return groups;
}

/**
 * Every name to tag, with its message: `{ names: Map<name, { message, governors?: Set, route, positional,
 * replacement? }>, routes, positional }`. `governors` limits a manifest route to the governors its row names; a
 * positional name is tagged in every governor holding it. A name on both lists takes the manifest replacement, else
 * the guard's.
 */
export function readDeprecations({ manifest, guardText }) {
  const routes = manifest.methods.filter((m) => m.engineDisposition === 'scheduled-for-removal');
  const guard = readGuardList(guardText);
  const names = new Map();
  for (const route of routes) {
    names.set(route.name, {
      route: true,
      positional: false,
      governors: new Set(route.governors),
      replacement: describeReplacement(route.replacement),
    });
  }
  const positional = [];
  for (const [group, list] of Object.entries(guard)) {
    for (const name of list) {
      positional.push(name);
      const destination = GUARD_DESTINATIONS[group](name);
      const entry = names.get(name);
      if (entry) {
        entry.positional = true;
        entry.governors = undefined; // a positional copy is tagged wherever a governor holds it
        entry.replacement ??= code(destination);
        entry.destination = destination;
      } else {
        names.set(name, { route: false, positional: true, replacement: code(destination), destination });
      }
    }
  }
  for (const [name, entry] of names) {
    const anchor = entry.positional ? ANCHORS.positional : ANCHORS.routes;
    entry.message = entry.replacement
      ? `Removed from the governors and engines in 8.0.0; use ${entry.replacement} (${anchor})`
      : `Removed from the governors and engines in 8.0.0; see ${anchor}`;
    if (entry.message.includes('*/')) throw new Error(`${name}: message would close the comment`);
    names.set(name, entry);
  }
  return { names, routes: routes.map((r) => r.name), positional };
}

/** `readDeprecations` from the package's own manifest and guard list. */
export function loadDeprecations({ REPO_ROOT, PACKAGE_ROOT }) {
  return readDeprecations({
    manifest: JSON.parse(readFileSync(join(REPO_ROOT, MANIFEST_PATH), 'utf8')),
    guardText: readFileSync(join(PACKAGE_ROOT, GUARD_PATH), 'utf8'),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The built declarations
// ---------------------------------------------------------------------------------------------------------------------

const unsuffixed = (name) => name.replace(/\$\d+$/, '');
const nameOf = (node) => (node.name && (node.name.text ?? node.name.escapedText)) || undefined;

/**
 * Namespaces (`declare namespace x { export { … } }`), root export specifiers and top-level declarations. A namespace
 * member is reached either directly (`query$h as query`) or through a const (`declare const index$4_scoring: typeof
 * scoring;` … `index$4_scoring as scoring`); `nsOf` sees through both.
 */
export function readStructure(ts, sf) {
  const namespaces = new Map(); // local -> [{ public, local, node }]
  const typeofConst = new Map(); // `declare const x: typeof y` -> y
  const rootExports = [];
  const topLevel = new Map(); // unsuffixed name -> [statements]
  const specifiers = (declaration) =>
    declaration.exportClause && ts.isNamedExports(declaration.exportClause) && !declaration.moduleSpecifier
      ? declaration.exportClause.elements.map((el) => ({
          public: el.name.text,
          local: (el.propertyName ?? el.name).text,
          node: el,
        }))
      : [];
  const remember = (name, st) => {
    const key = unsuffixed(name);
    (topLevel.get(key) ?? topLevel.set(key, []).get(key)).push(st);
  };
  for (const st of sf.statements) {
    if (ts.isModuleDeclaration(st) && st.body && ts.isModuleBlock(st.body)) {
      const members = st.body.statements.filter(ts.isExportDeclaration).flatMap(specifiers);
      namespaces.set(st.name.text, members);
      remember(st.name.text, st);
    } else if (ts.isExportDeclaration(st)) {
      if (!st.isTypeOnly) rootExports.push(...specifiers(st));
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        remember(d.name.text, st);
        if (d.type && ts.isTypeQueryNode(d.type) && ts.isIdentifier(d.type.exprName))
          typeofConst.set(d.name.text, d.type.exprName.text);
      }
    } else if (nameOf(st)) {
      remember(nameOf(st), st);
    }
  }
  const nsOf = (local) =>
    namespaces.has(local) ? local : namespaces.has(typeofConst.get(local)) ? typeofConst.get(local) : undefined;
  return { namespaces, rootExports, topLevel, nsOf };
}

/** Whether a public path (`tools.scoring.analyzeSequence`) names a member of the root declarations. */
export function resolvesPublicPath(structure, path) {
  const parts = path.split('.');
  let local = structure.rootExports.find((e) => e.public === parts[0])?.local;
  for (const part of parts.slice(1)) {
    const ns = local && structure.nsOf(local);
    local = ns && structure.namespaces.get(ns).find((s) => s.public === part)?.local;
  }
  return !!local;
}

/** Each governor member reachable from the `governors` namespace: `{ node, name, governor, paths, namespace }`. */
function governorMembers(structure) {
  const { namespaces, rootExports, nsOf } = structure;
  const governorsLocal = rootExports.find((e) => e.public === 'governors')?.local;
  const governorList = governorsLocal && namespaces.get(nsOf(governorsLocal));
  if (!governorList) return { members: [], governorNamespaces: new Set() };
  const members = new Map(); // node -> member
  const governorNamespaces = new Set();
  const walk = (local, path, governor, seen) => {
    governorNamespaces.add(local);
    for (const spec of namespaces.get(local) ?? []) {
      const next = [...path, spec.public];
      const ns = nsOf(spec.local);
      if (ns) {
        if (!seen.has(ns)) walk(ns, next, governor, new Set([...seen, ns]));
        continue;
      }
      const member = members.get(spec.node) ?? { node: spec.node, name: spec.public, namespace: local, paths: [] };
      member.paths.push({ governor, path: next.join('.') });
      members.set(spec.node, member);
    }
  };
  for (const g of governorList) {
    const ns = nsOf(g.local);
    if (ns) walk(ns, [g.public], g.public, new Set([ns]));
  }
  return { members: [...members.values()], governorNamespaces };
}

/** Namespaces a consumer reaches WITHOUT a governor (`tools`, `availability`, …): a tag there would leak. */
function nonGovernorNamespaces(structure, governorNamespaces) {
  const { namespaces, rootExports, nsOf } = structure;
  const reached = new Set();
  const governorsNs = nsOf(rootExports.find((e) => e.public === 'governors')?.local);
  const walk = (local) => {
    if (reached.has(local)) return;
    reached.add(local);
    for (const spec of namespaces.get(local) ?? []) if (nsOf(spec.local)) walk(nsOf(spec.local));
  };
  for (const e of rootExports) {
    const ns = nsOf(e.local);
    if (ns && ns !== governorsNs && !governorNamespaces.has(ns)) walk(ns);
  }
  return reached;
}

/** The single member `member` of top-level declaration(s) `container`, or the declaration itself. */
function aliasHosts(ts, structure, alias) {
  const statements = structure.topLevel.get(alias.container) ?? [];
  if (!alias.member) return statements;
  const hosts = [];
  for (const st of statements) {
    if (ts.isModuleDeclaration(st)) {
      for (const spec of structure.namespaces.get(st.name.text) ?? [])
        if (spec.public === alias.member) hosts.push(spec.node);
      continue;
    }
    const visit = (n) => {
      if (ts.isPropertySignature(n) && nameOf(n) === alias.member) hosts.push(n);
      else ts.forEachChild(n, visit);
    };
    visit(st);
  }
  return hosts;
}

const addressOf = (kind, key) => `${kind}:${key}`;

/**
 * Where tags belong in one built declaration file, and the problems that make the plan untrustworthy:
 * `{ targets: [{ address, category, name, node, message, paths? }], problems: string[] }`.
 * `bundle` is `root`, `constants` or `score-entry-state` (aliases name the bundles that declare them).
 */
export function planDeprecations(ts, text, deprecations, { bundle = 'root', fileName = 'bundle.d.ts' } = {}) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const structure = readStructure(ts, sf);
  const targets = [];
  const problems = [];
  const { names } = deprecations;

  // governor namespace members
  const { members, governorNamespaces } = governorMembers(structure);
  const leaky = nonGovernorNamespaces(structure, governorNamespaces);
  const seenRouteGovernors = new Map(); // name -> Set(governor)
  for (const member of members) {
    const entry = names.get(member.name);
    if (!entry) continue;
    const governors = member.paths.map((p) => p.governor);
    if (entry.governors && !governors.some((g) => entry.governors.has(g))) {
      problems.push(`${member.paths[0].path}: ${member.name} is scheduled only on ${[...entry.governors].join(', ')}`);
      continue;
    }
    if (leaky.has(member.namespace)) {
      problems.push(`${member.paths[0].path}: its namespace is also reached outside the governors; not tagged`);
      continue;
    }
    for (const g of governors)
      (seenRouteGovernors.get(member.name) ?? seenRouteGovernors.set(member.name, new Set()).get(member.name)).add(g);
    const category = entry.route && entry.positional ? 'route+positional' : entry.route ? 'route' : 'positional';
    const paths = member.paths.map((p) => p.path).sort();
    targets.push({
      address: addressOf('governor', paths[0]),
      category,
      name: member.name,
      node: member.node,
      message: entry.message,
      paths,
    });
  }
  if (bundle === 'root') {
    for (const [name, entry] of names) {
      const found = seenRouteGovernors.get(name) ?? new Set();
      if (!found.size) problems.push(`${name}: in no governor of the built declarations`);
      for (const g of entry.governors ?? []) if (!found.has(g)) problems.push(`${name}: not found on ${g}`);
    }
  }

  // engine method signatures
  const signatures = structure.topLevel.get('MethodSignatures')?.find(ts.isInterfaceDeclaration);
  if (bundle === 'root' && !signatures) problems.push('no MethodSignatures interface');
  for (const m of signatures?.members ?? []) {
    const entry = names.get(nameOf(m));
    if (!entry) continue;
    targets.push({
      address: addressOf('engine', nameOf(m)),
      category: 'engine',
      name: nameOf(m),
      node: m,
      message: entry.message,
    });
  }

  // utilities
  const utilities = structure.rootExports.filter((e) => e.public === 'utilities');
  if (bundle === 'root' && utilities.length !== 1) problems.push(`${utilities.length} root exports named utilities`);
  for (const u of utilities)
    targets.push({
      address: addressOf('export', 'utilities'),
      category: 'utilities',
      name: 'utilities',
      node: u.node,
      message: UTILITIES_MESSAGE,
    });

  // aliases
  for (const alias of ALIASES) {
    if (!alias.files.includes(bundle)) continue;
    const hosts = aliasHosts(ts, structure, alias);
    if (hosts.length !== 1)
      problems.push(`alias ${alias.alias} in ${alias.container}: ${hosts.length} declarations found, expected 1`);
    for (const node of hosts)
      targets.push({
        address: addressOf('alias', `${alias.container}.${alias.member ?? alias.alias}`),
        category: 'alias',
        name: alias.alias,
        node,
        message: alias.message,
      });
  }
  return { targets, problems, sf };
}

/** Insert each target's tag before its node. Returns the new text and the plan. */
export function injectDeprecations(ts, text, deprecations, options) {
  // a fresh bundle has no comments (`removeComments`); a tag already there means this file was injected before
  if (/@deprecated\b/.test(text)) throw new Error(`${options?.fileName ?? 'bundle'} already carries @deprecated tags`);
  const plan = planDeprecations(ts, text, deprecations, options);
  // a node that starts its line gets the tag on a line of its own; one inside a one-line list gets it inline
  const insertions = plan.targets
    .map((t) => {
      const pos = t.node.getStart(plan.sf);
      const indent = text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos);
      const tag = `/** @deprecated ${t.message} */`;
      return { pos, tag: /^[ \t]*$/.test(indent) ? `${tag}\n${indent}` : `${tag} ` };
    })
    .sort((a, b) => b.pos - a.pos);
  let out = text;
  for (const { pos, tag } of insertions) out = out.slice(0, pos) + tag + out.slice(pos);
  return { text: out, ...plan };
}

/**
 * Every `@deprecated` tag in a declaration file, with the address of the node it tags (the same addresses
 * `planDeprecations` gives, so the two compare) and its text: `[{ address, message }]`. A tag on a node no plan
 * addresses gets `unaddressed:<line>`.
 */
export function findDeprecations(ts, text, deprecations, options) {
  const plan = planDeprecations(ts, text, deprecations, options);
  const byNode = new Map(plan.targets.map((t) => [t.node, t.address]));
  const found = [];
  const visit = (node) => {
    for (const doc of node.jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (tag.tagName.text !== 'deprecated') continue;
        const comment = typeof tag.comment === 'string' ? tag.comment : ts.getTextOfJSDocComment(tag.comment);
        const line = plan.sf.getLineAndCharacterOfPosition(node.getStart(plan.sf)).line + 1;
        found.push({ address: byNode.get(node) ?? `unaddressed:${line}`, message: (comment ?? '').trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(plan.sf);
  // a comment the parser attaches to no node is still a tag a reader sees
  const attached = found.length;
  const raw = (text.match(/@deprecated\b/g) ?? []).length;
  if (raw !== attached) found.push({ address: `unattached:${raw - attached}`, message: '' });
  return { found, plan };
}
