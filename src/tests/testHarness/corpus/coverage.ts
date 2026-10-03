import { CORE_METHODS, CORE_METHOD_SOURCES } from './coreMethods';
import fs from 'fs';
import path from 'path';

/**
 * Golden corpus C3: what "100%" means, measured.
 *
 * Coverage of the corpus is not statements. It is: every core method has at least one scenario,
 * and every error code a core method can refuse with has been observed as a step result. This
 * module reads every scenario the sources wrote (recorded tests, oracles, fixtures) and reports,
 * per core method, the scenarios and steps that exercise it, the error codes observed, and the
 * error codes its own source file declares (the constants it imports from
 * errorConditionConstants) but no scenario has yet produced. Declared codes are read statically
 * from the method's file only, so helper-originated refusals show as observed-but-undeclared;
 * that is a known under-count, and it is reported rather than hidden.
 */
const ALIASES: Record<string, string> = {
  '@Generators': 'src/assemblies/generators',
  '@Assemblies': 'src/assemblies',
  '@Validators': 'src/validators',
  '@Constants': 'src/constants',
  '@Functions': 'src/functions',
  '@Fixtures': 'src/fixtures',
  '@Acquire': 'src/acquire',
  '@Helpers': 'src/helpers',
  '@Global': 'src/global',
  '@Mutate': 'src/mutate',
  '@Query': 'src/query',
  '@Tools': 'src/tools',
  '@Types': 'src/types',
};

function resolveAlias(spec: string): string | undefined {
  const [alias, ...rest] = spec.split('/');
  const base = ALIASES[alias];
  if (!base) return undefined;
  const file = path.join(base, ...rest);
  if (fs.existsSync(`${file}.ts`)) return `${file}.ts`;
  if (fs.existsSync(path.join(file, 'index.ts'))) return path.join(file, 'index.ts');
  return undefined;
}

/** Core method name → the source file its governor barrel re-exports it from. */
export function methodSources(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const barrel of Object.keys(CORE_METHOD_SOURCES)) {
    const text = fs.readFileSync(`src/assemblies/governors/${barrel}.ts`, 'utf8');
    const re = /^export\s+\{([^}]*)\}\s+from\s+'([^']+)';/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const file = resolveAlias(match[2]);
      for (const spec of match[1].split(',')) {
        const trimmed = spec.trim();
        if (!trimmed || trimmed.startsWith('type ')) continue;
        const alias = trimmed.split(/\s+as\s+/);
        out[(alias[1] ?? alias[0]).trim()] = file;
      }
    }
  }
  return out;
}

/** Error constant NAME → `code`, from errorConditionConstants.ts. */
export function errorCodesByName(): Record<string, string> {
  const text = fs.readFileSync('src/constants/errorConditionConstants.ts', 'utf8');
  const out: Record<string, string> = {};
  const re = /export const ([A-Z_][A-Z0-9_]*) = \{[^}]*?code: '([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) out[match[1]] = match[2];
  return out;
}

/** The error codes a file can refuse with by its own hand: the constants it imports. */
export function declaredErrorCodes(file: string | undefined, byName: Record<string, string>): string[] {
  if (!file) return [];
  const text = fs.readFileSync(file, 'utf8');
  const re = /import\s+\{([^}]*)\}\s+from\s+'@Constants\/errorConditionConstants'/g;
  const codes = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    for (const spec of match[1].split(',')) {
      const name = spec
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (byName[name]) codes.add(byName[name]);
    }
  }
  return [...codes].sort((a, b) => a.localeCompare(b));
}

export function readScenarioFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readScenarioFiles(full));
    else if (entry.name.endsWith('.jsonl') && !entry.name.startsWith('_')) out.push(full);
  }
  return out;
}

export type MethodCoverage = {
  method: string;
  file?: string;
  scenarios: number;
  steps: number;
  success: number;
  refused: number;
  sources: string[];
  declaredCodes: string[];
  observedCodes: string[];
  unobservedCodes: string[];
  observedUndeclared: string[];
};

export type CorpusCoverage = {
  generatedAt: string;
  scenarioFiles: number;
  scenarios: number;
  steps: number;
  coreMethods: number;
  methodsWithSteps: number;
  methodsAtZero: string[];
  declaredCodes: number;
  observedDeclaredCodes: number;
  methods: Record<string, MethodCoverage>;
};

/** Read every scenario under `dir` and compute coverage of the core method set. */
export function computeCoverage(dir: string): CorpusCoverage {
  const sources = methodSources();
  const byName = errorCodesByName();
  const methods: Record<
    string,
    MethodCoverage & { scenarioIds: Set<string>; observed: Set<string>; kinds: Set<string> }
  > = {};
  for (const method of [...CORE_METHODS].sort((a, b) => a.localeCompare(b))) {
    methods[method] = {
      method,
      file: sources[method],
      scenarios: 0,
      steps: 0,
      success: 0,
      refused: 0,
      sources: [],
      declaredCodes: declaredErrorCodes(sources[method], byName),
      observedCodes: [],
      unobservedCodes: [],
      observedUndeclared: [],
      scenarioIds: new Set(),
      observed: new Set(),
      kinds: new Set(),
    };
  }
  const files = readScenarioFiles(dir);
  let scenarios = 0;
  let steps = 0;
  for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const scenario = JSON.parse(line);
      scenarios += 1;
      for (const step of scenario.steps ?? []) {
        steps += 1;
        const entry = methods[step.directive?.method];
        if (!entry) continue;
        entry.steps += 1;
        entry.scenarioIds.add(scenario.scenarioId);
        entry.kinds.add(scenario.source?.kind ?? 'unknown');
        if (step.result?.error) {
          entry.refused += 1;
          entry.observed.add(step.result.error);
        } else entry.success += 1;
      }
    }
  }
  let declared = 0;
  let observedDeclared = 0;
  const out: Record<string, MethodCoverage> = {};
  for (const entry of Object.values(methods)) {
    const observedCodes = [...entry.observed].sort((a, b) => a.localeCompare(b));
    const declaredSet = new Set(entry.declaredCodes);
    const unobservedCodes = entry.declaredCodes.filter((code) => !entry.observed.has(code));
    const observedUndeclared = observedCodes.filter((code) => !declaredSet.has(code));
    declared += entry.declaredCodes.length;
    observedDeclared += entry.declaredCodes.length - unobservedCodes.length;
    out[entry.method] = {
      method: entry.method,
      file: entry.file,
      scenarios: entry.scenarioIds.size,
      steps: entry.steps,
      success: entry.success,
      refused: entry.refused,
      sources: [...entry.kinds].sort((a, b) => a.localeCompare(b)),
      declaredCodes: entry.declaredCodes,
      observedCodes,
      unobservedCodes,
      observedUndeclared,
    };
  }
  const methodsAtZero = Object.values(out)
    .filter((m) => m.steps === 0)
    .map((m) => m.method);
  return {
    generatedAt: new Date().toISOString(),
    scenarioFiles: files.length,
    scenarios,
    steps,
    coreMethods: CORE_METHODS.size,
    methodsWithSteps: CORE_METHODS.size - methodsAtZero.length,
    methodsAtZero,
    declaredCodes: declared,
    observedDeclaredCodes: observedDeclared,
    methods: out,
  };
}

export function renderCoverage(cov: CorpusCoverage): string {
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
  const lines = [
    `# Corpus coverage of the core method set`,
    ``,
    `| | |`,
    `|---|---|`,
    `| scenarios / steps read | ${cov.scenarios} / ${cov.steps} from ${cov.scenarioFiles} files |`,
    `| core methods with ≥1 step | ${cov.methodsWithSteps} / ${cov.coreMethods} (${pct(cov.methodsWithSteps, cov.coreMethods)}) |`,
    `| declared error codes observed | ${cov.observedDeclaredCodes} / ${cov.declaredCodes} (${pct(cov.observedDeclaredCodes, cov.declaredCodes)}) |`,
    ``,
    `## Core methods with no scenario (${cov.methodsAtZero.length})`,
    ``,
    cov.methodsAtZero.length ? cov.methodsAtZero.map((m) => `- \`${m}\``).join('\n') : '(none)',
    ``,
    `## Declared error codes never observed, by method`,
    ``,
    `| method | steps | observed | unobserved |`,
    `|---|---|---|---|`,
    ...Object.values(cov.methods)
      .filter((m) => m.unobservedCodes.length)
      .sort((a, b) => b.unobservedCodes.length - a.unobservedCodes.length || a.method.localeCompare(b.method))
      .map(
        (m) =>
          `| \`${m.method}\` | ${m.steps} | ${m.observedCodes.join(', ') || '—'} | ${m.unobservedCodes.join(', ')} |`,
      ),
  ];
  return lines.join('\n') + '\n';
}
