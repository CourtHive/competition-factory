#!/usr/bin/env node
// Registration-only identity bridge: never executes a matrix cell or a composition-control callback.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const prefix = 'src/tests/mutations/exitPropagation/';
const originals = ['ExtensionDual', 'ExtensionLine', 'CollegeDefault', 'LaverCup', 'UnevenDuals'].map(
  (n) => `${prefix}teamMatrix${n}.test.ts`,
);
const counts = { ExtensionLine: 4, CollegeDefault: 4, LaverCup: 6 };
const fixture = 'scripts/fixtures/team-arm-partition-bridge.jsonl';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const canonical = (value) =>
  JSON.stringify(value, (_key, val) =>
    val && !Array.isArray(val) && typeof val === 'object'
      ? Object.fromEntries(
          Object.keys(val)
            .sort()
            .map((k) => [k, val[k]]),
        )
      : val,
  );
const tokenHash = (text) =>
  hash(
    ts
      .createPrinter({ removeComments: true })
      .printFile(
        ts.createSourceFile('identity.ts', `const captured = ${text};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      ),
  );
const read = (file, revision) =>
  revision
    ? execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' })
    : readFileSync(resolve(root, file), 'utf8');
const render = (title, cell) => title.replace(/\$([A-Za-z][A-Za-z0-9_]*)/g, (_s, k) => String(cell[k]));
const destination = (row) => {
  const arm = Object.keys(counts).find((n) => row.file === `${prefix}teamMatrix${n}.test.ts`);
  return !arm || !row.cell ? row.file : `${prefix}teamMatrix${arm}.part${row.cell.seed % counts[arm]}.test.ts`;
};

function collect(files, revision, enabled, cellOverrides) {
  const rows = [];
  for (const file of files) {
    const cache = new Map(),
      hooks = [];
    let state = {};
    const sandbox = vm.createContext({
      Math: Object.create(Math),
      process: { env: { TEAM_ARMS: enabled ? '1' : undefined }, cwd: () => root },
      console,
      Set,
      Map,
      JSON,
    });
    const test = (title, fn) =>
      rows.push({
        file,
        project: 'shared',
        title,
        each: false,
        mode: 'run',
        timeout: null,
        bodyHash: tokenHash(fn.toString()),
        cell: null,
        drawId: null,
        registrationIndex: rows.filter((r) => r.file === file).length,
      });
    test.for = (values) => (title, fn) => {
      for (const value of values)
        rows.push({
          file,
          project: 'shared',
          title: title.replace('%s', String(value)),
          each: true,
          mode: 'run',
          timeout: null,
          bodyHash: tokenHash(fn.toString()),
          cell: null,
          parameter: value,
          drawId: null,
          registrationIndex: rows.filter((r) => r.file === file).length,
        });
    };
    test.skipIf = (skip) => ({
      for: (cells) => (title, options, fn) => {
        for (const cell of cells)
          rows.push({
            file,
            project: 'shared',
            title: render(title, cell),
            each: true,
            mode: skip ? 'skip' : 'run',
            timeout: options.timeout,
            bodyHash: tokenHash(fn.toString()),
            cell: JSON.parse(JSON.stringify(cell)),
            drawId: `team-${cell.seed}`,
            registrationIndex: rows.filter((r) => r.file === file).length,
          });
      },
    });
    const vitest = { test, expect: { getState: () => state }, beforeEach: (fn) => hooks.push(fn) };
    function load(path) {
      if (cache.has(path)) return cache.get(path).exports;
      const module = { exports: {} };
      cache.set(path, module);
      const req = (id) => {
        if (id === 'vitest') return vitest;
        if (id === 'node:path') return require('node:path');
        if (id.startsWith('@Constants/')) return load('src/constants/' + id.slice(11) + '.ts');
        if (id === '@Tools/prng') return load('src/tools/prng.ts');
        if (id === '@Tests/testHarness/seedMathRandom') return load('src/tests/testHarness/seedMathRandom.ts');
        if (id === '@Tests/testHarness/exitPropagation/matrixCells')
          return Object.assign({}, load('src/tests/testHarness/exitPropagation/matrixCells.ts'), cellOverrides ?? {});
        if (id === '@Tests/testHarness/exitPropagation/registerTeamArm')
          return load('src/tests/testHarness/exitPropagation/registerTeamArm.ts');
        if (id.startsWith('.')) {
          const p = relative(root, resolve(root, dirname(path), id));
          if (p.endsWith('/transitions') || p.endsWith('/driver')) return {};
          return load(p + '.ts');
        }
        // Engine/query imports are inert: registration does not execute the cell/control bodies.
        if (id.startsWith('@')) return {};
        throw new Error(`unreviewed registration import: ${id}`);
      };
      const text = read(path, revision);
      const js = ts.transpileModule(text, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      vm.runInContext(`(function(require,module,exports){${js}\n})`, sandbox, { filename: path })(
        req,
        module,
        module.exports,
      );
      if (path === 'src/tests/testHarness/exitPropagation/matrixCells.ts' && cellOverrides)
        Object.assign(module.exports, cellOverrides);
      return module.exports;
    }
    const seeds = load('src/tests/testHarness/seedMathRandom.ts');
    let recorderSeedIdentity;
    hooks.push(() => {
      recorderSeedIdentity = JSON.parse(JSON.stringify(seeds.currentTestSeed()));
    });
    load(file);
    const occurrences = new Map();
    for (const row of rows.filter((r) => r.file === file)) {
      row.occurrence = (occurrences.get(row.title) ?? 0) + 1;
      occurrences.set(row.title, row.occurrence);
      state = { testPath: resolve(root, file), currentTestName: row.title };
      for (const hook of hooks) hook();
      row.seedIdentity = JSON.parse(JSON.stringify(seeds.currentTestSeed()));
      row.recorderSeedIdentity = recorderSeedIdentity;
      row.randomSamples = vm.runInContext('[Math.random(),Math.random(),Math.random()]', sandbox);
    }
  }
  return rows;
}
function multiset(rows) {
  const c = new Map();
  for (const row of rows) {
    const k = canonical(row);
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return canonical([...c].sort(([a], [b]) => a.localeCompare(b)));
}
function invariant(ok, message) {
  if (!ok) throw new Error(message);
}
function namedNode(source, name, kind) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  let found;
  function walk(n) {
    if (n.name?.getText(ast) === name && kind(n)) found = n;
    ts.forEachChild(n, walk);
  }
  walk(ast);
  invariant(found, `missing declaration: ${name}`);
  return [found, ast];
}
function seedExtraction(bridge) {
  const old = read('src/tests/testHarness/seedMathRandom.ts', bridge.sourceRevision);
  const [oldHash, oldAst] = namedNode(old, 'hash', ts.isFunctionDeclaration);
  const [newHash, newAst] = namedNode(
    read('src/tests/testHarness/testRandomSeed.ts'),
    'hash',
    ts.isFunctionDeclaration,
  );
  invariant(
    oldHash.body.getText(oldAst) === newHash.body.getText(newAst),
    'canonical seed hash body changed during extraction',
  );
  for (const arm of Object.keys(counts)) {
    const file = `${prefix}teamMatrix${arm}.test.ts`;
    const [before, beforeAst] = namedNode(read(file, bridge.sourceRevision), 'CELLS', ts.isVariableDeclaration);
    const [after, afterAst] = namedNode(read(file), 'CELLS', ts.isVariableDeclaration);
    invariant(
      before.initializer.getText(beforeAst) === after.initializer.getText(afterAst),
      'composition-control cell selection changed',
    );
  }
}
const references = new Map();
function verify(bridge, actual) {
  if (!references.has(bridge.sourceRevision))
    references.set(bridge.sourceRevision, baselineBridge(bridge.sourceRevision));
  const reference = references.get(bridge.sourceRevision);
  invariant(
    bridge.rowsSha256 === reference.rowsSha256 && canonical(bridge.sourceHashes) === canonical(reference.sourceHashes),
    'bridge differs from immutable original source registration',
  );
  invariant(bridge.schema === 1, 'unknown bridge schema');
  seedExtraction(bridge);
  invariant(hash(canonical(bridge.rows)) === bridge.rowsSha256, 'bridge rows seal changed');
  const expected = bridge.rows.map((r) => ({ ...r.original, ...r.destination }));
  if (process.env.TEAM_BRIDGE_DEBUG && multiset(actual) !== multiset(expected)) {
    const a = actual.find((a) => {
      const e = expected.find((e) => e.file === a.file && e.title === a.title && e.occurrence === a.occurrence);
      return !e || canonical(a) !== canonical(e);
    });
    const e = expected.find((e) => e.file === a?.file && e.title === a?.title && e.occurrence === a?.occurrence);
    console.error(JSON.stringify({ actual: a, expected: e }));
  }
  invariant(multiset(actual) === multiset(expected), 'registration identity/cell/seed/body/mode/timeout mismatch');
  const files = [...new Set(expected.map((r) => r.file))];
  invariant(files.length === 19, 'TEAM file inventory must remain nineteen');
  const selected = JSON.parse(read('package.json'))
    .scripts['verify:team-arms'].split('vitest run ')[1]
    ?.trim()
    .split(/\s+/);
  invariant(
    multiset(selected) === multiset(currentFiles()),
    'verify:team-arms must select exactly nineteen reviewed files',
  );
  const cells = actual.filter((r) => r.cell);
  invariant(cells.length === 1520, 'TEAM cells must remain 1520');
  invariant(actual.filter((r) => !r.cell).length === 8, 'TEAM controls must remain eight');
  for (const file of files)
    invariant(
      actual.some((r) => r.file === file),
      'empty partition',
    );
  for (const file of [
    'src/tests/testHarness/exitPropagation/matrixCells.ts',
    'vitest.config.mts',
    originals[0],
    originals[4],
  ])
    invariant(hash(read(file)) === bridge.sourceHashes[file], `protected source changed: ${file}`);
  return {
    files: files.length,
    cells: cells.length,
    controls: actual.length - cells.length,
    inventory: Object.fromEntries(
      files.sort().map((file) => [
        file,
        {
          cells: actual.filter((row) => row.file === file && row.cell).length,
          controls: actual.filter((row) => row.file === file && !row.cell).length,
        },
      ]),
    ),
  };
}
function baselineBridge(revision) {
  const rows = collect(originals, revision, true);
  const disabled = collect(originals, revision, false);
  invariant(rows.length === 1528, 'original inventory differs');
  const mapped = rows.map((row) => ({ original: row, destination: { ...row, file: destination(row) } }));
  // Registration index/occurrence are local to each destination file; preserve original effective seed identity.
  const seen = new Map(),
    indexes = new Map();
  for (const row of mapped) {
    const d = row.destination;
    const k = d.file + '::' + d.title;
    d.occurrence = (seen.get(k) ?? 0) + 1;
    seen.set(k, d.occurrence);
    d.registrationIndex = indexes.get(d.file) ?? 0;
    indexes.set(d.file, d.registrationIndex + 1);
  }
  const sourceFiles = [
    ...originals,
    'src/tests/testHarness/exitPropagation/matrixCells.ts',
    'src/tests/testHarness/seedMathRandom.ts',
    'vitest.config.mts',
  ];
  return {
    schema: 1,
    sourceRevision: execFileSync('git', ['rev-parse', revision], { encoding: 'utf8' }).trim(),
    sourceHashes: Object.fromEntries(sourceFiles.map((f) => [f, hash(read(f, revision))])),
    rows: mapped.map((r) => ({
      original: r.original,
      destination: {
        file: r.destination.file,
        occurrence: r.destination.occurrence,
        registrationIndex: r.destination.registrationIndex,
      },
    })),
    rowsSha256: hash(
      canonical(
        mapped.map((r) => ({
          original: r.original,
          destination: {
            file: r.destination.file,
            occurrence: r.destination.occurrence,
            registrationIndex: r.destination.registrationIndex,
          },
        })),
      ),
    ),
    disabledRowsSha256: hash(canonical(disabled)),
    selection: {
      originals,
      partitions: Object.fromEntries(
        Object.keys(counts).map((n) => [
          n,
          Array.from({ length: counts[n] }, (_, i) => `${prefix}teamMatrix${n}.part${i}.test.ts`),
        ]),
      ),
    },
  };
}
function currentFiles() {
  return [
    ...originals,
    ...Object.entries(counts).flatMap(([n, c]) =>
      Array.from({ length: c }, (_, i) => `${prefix}teamMatrix${n}.part${i}.test.ts`),
    ),
  ];
}
function verifyExecution(bridge, records) {
  for (const row of records)
    invariant(row.status === (row.mode === 'skip' ? 'skipped' : 'passed'), 'dynamic run-to-skip or execution failure');
  return verify(
    bridge,
    records.map((record) => {
      const identity = { ...record };
      delete identity.status;
      return identity;
    }),
  );
}

function verifyNativeReport(bridge, report, enabled) {
  invariant(report.success === true, 'native run failed');
  const expected = bridge.rows.map((row) => ({ ...row.original, ...row.destination }));
  const expectedFiles = [...new Set(expected.map((row) => row.file))];
  invariant(
    multiset(report.testResults.map((file) => relative(root, file.name))) === multiset(expectedFiles),
    'native selected file inventory differs from the exact nineteen-file bridge',
  );
  const actual = [];
  for (const file of report.testResults) {
    const occurrences = new Map();
    for (const row of file.assertionResults) {
      const title = row.fullName;
      const occurrence = (occurrences.get(title) ?? 0) + 1;
      occurrences.set(title, occurrence);
      actual.push({ file: relative(root, file.name), title, occurrence, status: row.status });
    }
  }
  const wanted = expected.map((row) => ({
    file: row.file,
    title: row.title,
    occurrence: row.occurrence,
    status: row.cell && !enabled ? 'skipped' : 'passed',
  }));
  invariant(
    multiset(actual) === multiset(wanted),
    'native executed identity/status multiset differs from sealed bridge',
  );
  return { nativeFiles: report.testResults.length, nativeTests: actual.length, enabled };
}

function verifyNative(bridge, path, enabled) {
  return verifyNativeReport(bridge, JSON.parse(readFileSync(path, 'utf8')), enabled);
}

function main() {
  const [command, arg] = process.argv.slice(2);
  if (command === 'seal') {
    const revision = arg ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const b = baselineBridge(revision);
    mkdirSync(dirname(fixture), { recursive: true });
    const { rows, ...header } = b;
    writeFileSync(fixture, [header, ...rows].map((row) => JSON.stringify(row)).join('\n') + '\n');
    console.log(JSON.stringify({ sealed: b.rows.length, sha256: b.rowsSha256, source: revision }));
    return;
  }
  const [header, ...rows] = readFileSync(fixture, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const bridge = { ...header, rows };
  const actual = collect(currentFiles(), undefined, true);
  const result = verify(bridge, actual);
  if (command === 'native-main' || command === 'native-team')
    Object.assign(result, verifyNative(bridge, arg, command === 'native-team'));
  if (command === 'execution') {
    verifyExecution(bridge, JSON.parse(readFileSync(arg, 'utf8')));
  }
  if (command === 'self-test') {
    const checks = {
      missing: (r) =>
        r.splice(
          r.findIndex((x) => x.cell),
          1,
        ),
      duplicate: (r) => r.push(structuredClone(r.find((x) => x.cell))),
      seed: (r) => r.find((x) => x.cell).cell.seed++,
      field: (r) => (r.find((x) => x.cell).cell.lineUps = !r.find((x) => x.cell).cell.lineUps),
      destination: (r) => (r.find((x) => x.cell).file = originals[1]),
      title: (r) => (r.find((x) => x.cell).title = 'prefix ' + r.find((x) => x.cell).title),
      controlMissing: (r) =>
        r.splice(
          r.findIndex((x) => !x.cell),
          1,
        ),
      controlDuplicate: (r) => r.push(structuredClone(r.find((x) => !x.cell))),
      mode: (r) => (r.find((x) => x.cell).mode = 'skip'),
      timeout: (r) => (r.find((x) => x.cell).timeout = 1),
      body: (r) => (r.find((x) => x.cell).bodyHash = 'weakened'),
      effectiveSeed: (r) => r.find((x) => x.cell).seedIdentity.seed++,
      rng: (r) => (r.find((x) => x.cell).randomSamples[0] = 0),
      diagnostics: (r) => (r.find((x) => x.cell).seedIdentity.name = 'relocated-diagnostic'),
      recorderSeed: (r) => r.find((x) => x.cell).recorderSeedIdentity.seed++,
    };
    for (const [name, mutate] of Object.entries(checks)) {
      const changed = structuredClone(actual);
      mutate(changed);
      let rejected = false;
      try {
        verify(bridge, changed);
      } catch {
        rejected = true;
      }
      invariant(rejected, `negative control escaped: ${name}`);
    }
    const executed = actual.map((row) => ({ ...row, status: 'passed' }));
    verifyExecution(bridge, executed);
    const dynamicSkip = structuredClone(executed);
    dynamicSkip.find((row) => row.cell).status = 'skipped';
    let skipRejected = false;
    try {
      verifyExecution(bridge, dynamicSkip);
    } catch {
      skipRejected = true;
    }
    invariant(skipRejected, 'dynamic run-to-skip escaped');
    const sample = bridge.rows.find((row) => row.original.file === originals[1] && row.original.cell).original.cell;
    const duplicateCells = [
      { ...sample, seed: 450004 },
      { ...sample, seed: 450005 },
    ];
    const overrides = { TEAM_EXTENSION_LINE_CELLS: duplicateCells };
    const oldDuplicates = collect([originals[1]], bridge.sourceRevision, true, overrides).filter((row) => row.cell);
    const newDuplicates = collect(
      [`${prefix}teamMatrixExtensionLine.part0.test.ts`, `${prefix}teamMatrixExtensionLine.part1.test.ts`],
      undefined,
      true,
      overrides,
    );
    invariant(
      newDuplicates[1].occurrence === 1 && newDuplicates[1].seedIdentity.ordinal === 2,
      'split duplicate title lost original occurrence ordinal',
    );
    for (let i = 0; i < 2; i++)
      for (const field of ['seedIdentity', 'recorderSeedIdentity', 'randomSamples', 'bodyHash'])
        invariant(
          canonical(oldDuplicates[i][field]) === canonical(newDuplicates[i][field]),
          `split duplicate title changed ${field}`,
        );
    result.hookOrderControl = 'downstream recorder observes original effective seed before cell body';
    result.duplicateTitleControl = 'destination occurrence one retains original occurrence two';
    const native = {
      success: true,
      testResults: currentFiles().map((file) => ({
        name: resolve(root, file),
        assertionResults: actual
          .filter((row) => row.file === file)
          .map((row) => ({ fullName: row.title, status: 'passed' })),
      })),
    };
    verifyNativeReport(bridge, native, true);
    const suiteMutations = {
      extraEmptySuite: (report) =>
        report.testResults.push({ name: resolve(root, 'src/unknown.test.ts'), assertionResults: [] }),
      duplicateEmptySuite: (report) =>
        report.testResults.push({ name: report.testResults[0].name, assertionResults: [] }),
      missingSuite: (report) => report.testResults.pop(),
      sameCountDuplicateSuite: (report) => {
        report.testResults[0].name = report.testResults[1].name;
      },
    };
    for (const [name, mutate] of Object.entries(suiteMutations)) {
      const changed = structuredClone(native);
      mutate(changed);
      let rejected = false;
      try {
        verifyNativeReport(bridge, changed, true);
      } catch (error) {
        rejected = error.message.includes('native selected file inventory');
      }
      invariant(rejected, `native suite inventory negative control escaped: ${name}`);
    }
    result.negativeControls = [...Object.keys(checks), 'dynamicRunToSkip', ...Object.keys(suiteMutations)];
  }
  console.log(JSON.stringify(result));
}
main();
