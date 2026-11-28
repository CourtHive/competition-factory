/**
 * The editor probe of verify:deprecations: does a consumer's editor strike through a deprecated route?
 *
 * Runs the TypeScript LANGUAGE SERVICE (what VS Code and every tsserver editor use) over small consumer files that
 * import the UNPACKED tarball as `tods-competition-factory`, and reads its suggestion diagnostics (`reportsDeprecated`,
 * codes 6385 / 6387): the strike-through. Three consumers, one per declaration copy:
 *
 *   esm     probe.mts, moduleResolution nodenext  -> dist/*.d.mts (the `import` condition)
 *   cjs     probe.cts, moduleResolution nodenext  -> dist/*.d.cts (the `require` condition)
 *   node10  probe.ts,  moduleResolution node10    -> dist/*.d.ts  (`types` / `typesVersions`)
 *
 * The samples come from the same plan the count uses, so the manifest and guard list choose them: one route per
 * governor, nested (`x.query.y`) and `governors.x.y` paths, the governors subpath, engine methods of each category,
 * `utilities`, every alias, the untyped engines and `FactoryEngine`, and controls that must NOT fire (the `tools` /
 * `availability` homes of the same functions, a retained route, a live engine method, a live constant, the typed
 * engines and `FactoryEngineTyped`).
 */
import { mkdtempSync, rmSync, symlinkSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { MANIFEST_PATH, planDeprecations } from '../lib/deprecations.mjs';
import { REPO_ROOT } from '../lib/repoRoot.mjs';

const MANIFEST = () => JSON.parse(readFileSync(join(REPO_ROOT, MANIFEST_PATH), 'utf8'));

/** The probe's sample lines: `{ group, code, flag }`; `flag` is the identifier that must be struck, or null. */
export function samples(rootText, deprecations, retained) {
  const { targets } = planDeprecations(ts, rootText, deprecations, { bundle: 'root' });
  const out = [];
  const governorTargets = targets.filter((t) => t.paths).sort((a, b) => (a.address < b.address ? -1 : 1));
  const governorsUsed = new Set();
  for (const t of governorTargets) {
    const path = t.paths.find((p) => p.split('.').length === 2);
    if (!path || governorsUsed.has(path.split('.')[0])) continue;
    governorsUsed.add(path.split('.')[0]);
    out.push({ group: 'governor', code: `${path};`, flag: t.name, governor: path.split('.')[0] });
  }
  for (const category of ['route', 'route+positional', 'positional']) {
    const t = governorTargets.find((x) => x.category === category && x.paths[0].split('.').length === 2);
    const nested = governorTargets.find((x) => x.category === category && x.paths[0].split('.').length === 3);
    if (t) out.push({ group: 'governors-namespace', code: `governors.${t.paths[0]};`, flag: t.name });
    if (t) out.push({ group: 'governors-subpath', code: `sub.${t.paths[0]};`, flag: t.name });
    if (nested) out.push({ group: 'governor-nested', code: `${nested.paths[0]};`, flag: nested.name });
    const engine = targets.find(
      (x) => x.category === 'engine' && deprecationCategory(deprecations, x.name) === category,
    );
    if (engine) {
      out.push({ group: 'engine', code: `tournamentEngine.${engine.name};`, flag: engine.name });
      out.push({ group: 'engine', code: `competitionEngine.${engine.name};`, flag: engine.name });
    }
  }
  out.push(
    { group: 'utilities', code: 'utilities.unique;', flag: 'utilities' },
    { group: 'utilities', code: 'factory.utilities;', flag: 'utilities' },
    { group: 'alias', code: 'globalState.getNotices;', flag: 'getNotices' },
    {
      group: 'alias',
      code: 'declare const listener: globalState.CallListenerArgs; listener.notices;',
      flag: 'notices',
    },
    { group: 'alias', code: 'matchUpActionConstants.SCHEDULE_METHOD;', flag: 'SCHEDULE_METHOD' },
    // node10 resolves no `constants` subpath types (`typesVersions` maps none), so that run skips this line
    {
      group: 'alias',
      code: 'constantsSubpath.matchUpActionConstants.SCHEDULE_METHOD;',
      flag: 'SCHEDULE_METHOD',
      skip: ['node10'],
    },
    {
      group: 'alias',
      code: 'declare const pa: NonNullable<Parameters<typeof tournamentEngine.positionActions>[0]>; pa.restrictAdHocRoundParticipants;',
      flag: 'restrictAdHocRoundParticipants',
    },
    {
      group: 'alias',
      code: 'declare const ma: NonNullable<Parameters<typeof tournamentEngine.matchUpActions>[0]>; ma.restrictAdHocRoundParticipants;',
      flag: 'restrictAdHocRoundParticipants',
    },
    { group: 'alias', code: 'tournamentEngine.getTournamentInfo().eventInfo;', flag: 'eventInfo' },
    { group: 'alias', code: 'export type Fee = EntryFee;', flag: 'EntryFee' },
    { group: 'untyped', code: 'tournamentEngineUntyped.getParticipants;', flag: 'tournamentEngineUntyped' },
    { group: 'untyped', code: 'competitionEngineUntyped.getParticipants;', flag: 'competitionEngineUntyped' },
    { group: 'untyped', code: 'factory.tournamentEngineUntyped;', flag: 'tournamentEngineUntyped' },
    { group: 'untyped', code: 'export type Open = FactoryEngine;', flag: 'FactoryEngine' },
    // controls: none of these may be struck
    { group: 'control', code: 'tools.formats.parse;', flag: null },
    { group: 'control', code: 'tools.scoring.validateMatchUpScore;', flag: null },
    { group: 'control', code: 'availability.buildDayRange;', flag: null },
    { group: 'control', code: 'toStatObjects;', flag: null },
    { group: 'control', code: 'tournamentEngine.getParticipants;', flag: null },
    { group: 'control', code: 'matchUpActionConstants.SCORE_METHOD;', flag: null },
    { group: 'control', code: 'tools.unique;', flag: null },
    { group: 'control', code: 'tournamentEngine; competitionEngine;', flag: null },
    { group: 'control', code: 'export type Typed = FactoryEngineTyped;', flag: null },
  );
  for (const r of retained.slice(0, 3))
    out.push({ group: 'control', code: `${r.governors[0]}.${r.name}; tournamentEngine.${r.name};`, flag: null });
  return out;
}

function deprecationCategory(deprecations, name) {
  const e = deprecations.names.get(name);
  return e.route && e.positional ? 'route+positional' : e.route ? 'route' : 'positional';
}

const HEADER = {
  esm: [
    "import * as factory from 'tods-competition-factory';",
    "import * as sub from 'tods-competition-factory/governors';",
    "import * as constantsSubpath from 'tods-competition-factory/constants';",
  ],
};

/** Run the probe over an unpacked package directory. Returns `{ lines, problems }`. */
export function probe(packageDir, deprecations) {
  const rootText = readFileSync(join(packageDir, 'dist/tods-competition-factory.d.ts'), 'utf8');
  const retained = MANIFEST().methods.filter((m) => m.engineDisposition === 'retained');
  const list = samples(rootText, deprecations, retained);
  const governorNames = [...new Set(list.filter((s) => s.governor).map((s) => s.governor))];
  for (const r of retained.slice(0, 3)) if (!governorNames.includes(r.governors[0])) governorNames.push(r.governors[0]);
  const named = [
    ...governorNames,
    'governors',
    'utilities',
    'tools',
    'availability',
    'globalState',
    'matchUpActionConstants',
    'tournamentEngine',
    'competitionEngine',
    'tournamentEngineUntyped',
    'competitionEngineUntyped',
    'toStatObjects',
  ];
  const imports = [
    `import { ${named.join(', ')} } from 'tods-competition-factory';`,
    "import type { EntryFee, FactoryEngine, FactoryEngineTyped } from 'tods-competition-factory';",
    ...HEADER.esm,
  ];
  const body = [...imports, ...list.map((s) => s.code), 'export {};', ''].join('\n');
  const firstLine = imports.length;

  const realPackage = realpathSync(packageDir);
  const dir = mkdtempSync(join(tmpdir(), 'verify-deprecations-probe-'));
  const lines = [];
  const problems = [];
  try {
    mkdirSync(join(dir, 'node_modules'));
    symlinkSync(packageDir, join(dir, 'node_modules/tods-competition-factory'), 'dir');
    const runs = [
      { label: 'esm', file: 'probe.mts', options: { module: ts.ModuleKind.NodeNext }, copy: '.d.mts' },
      { label: 'cjs', file: 'probe.cts', options: { module: ts.ModuleKind.NodeNext }, copy: '.d.cts' },
      {
        label: 'node10',
        file: 'probe.ts',
        options: { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 },
        copy: '.d.ts',
      },
    ];
    for (const run of runs) {
      const file = join(dir, run.file);
      // the same lines in every run, so line numbers map to samples; node10 has no constants subpath to import
      const text =
        run.label === 'node10'
          ? body.replace(/^import \* as constantsSubpath from .*$/m, 'declare const constantsSubpath: any;')
          : body;
      const files = new Map([[file, text]]);
      const options = {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        ...run.options,
      };
      const service = ts.createLanguageService(
        {
          getScriptFileNames: () => [file],
          getScriptVersion: () => '1',
          getScriptSnapshot: (f) => {
            const text = files.get(f) ?? ts.sys.readFile(f);
            return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
          },
          getCurrentDirectory: () => dir,
          getCompilationSettings: () => options,
          getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
          fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
          readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
          realpath: ts.sys.realpath,
          directoryExists: ts.sys.directoryExists,
          getDirectories: ts.sys.getDirectories,
        },
        ts.createDocumentRegistry(),
      );
      const program = service.getProgram();
      const sf = program.getSourceFile(file);
      // the copy this consumer resolved: the probe is only worth something against the file that condition serves
      const resolved = program
        .getSourceFiles()
        .map((s) => s.fileName)
        .filter((f) => f.startsWith(`${realPackage}/dist/`))
        .map((f) => f.slice(realPackage.length + 1));
      const wrong = resolved.filter((f) => !f.endsWith(run.copy));
      if (!resolved.length || wrong.length) problems.push(`${run.label}: resolved ${resolved.join(', ')}`);
      const unresolved = service
        .getSemanticDiagnostics(file)
        .filter((d) => d.code === 2307 || d.code === 2305 || d.code === 2724);
      for (const d of unresolved) problems.push(`${run.label}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);

      const struck = new Map(); // line -> [identifier]
      for (const d of service.getSuggestionDiagnostics(file)) {
        if (!d.reportsDeprecated) continue;
        const line = sf.getLineAndCharacterOfPosition(d.start).line;
        (struck.get(line) ?? struck.set(line, []).get(line)).push(text.substr(d.start, d.length));
      }
      const tally = {};
      list.forEach((s, i) => {
        if (s.skip?.includes(run.label)) return;
        const hits = struck.get(firstLine + i) ?? [];
        const ok = s.flag ? hits.includes(s.flag) : hits.length === 0;
        const t = (tally[s.group] ??= { ok: 0, of: 0 });
        t.of += 1;
        if (ok) t.ok += 1;
        else
          problems.push(`${run.label}: ${s.code} — ${s.flag ? `${s.flag} not struck` : `struck ${hits.join(', ')}`}`);
      });
      lines.push(
        `${run.label} (${resolved.filter((f) => f.startsWith('dist/tods')).join(', ')}): ` +
          Object.entries(tally)
            .map(([g, t]) => `${g} ${t.ok}/${t.of}`)
            .join(', '),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return { lines, problems };
}
