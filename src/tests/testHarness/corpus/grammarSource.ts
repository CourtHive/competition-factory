import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { isAggregateFormat } from '@Helpers/matchUpFormatCode/isAggregateFormat';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { canonicalHash, canonicalObject } from './hash';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { getSchemaWriteMode } from '@Global/state/globalState';
import * as fixtureFormats from '@Fixtures/scoring/matchUpFormats';
import { canonicalJson } from '@Tools/canonicalJson';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Golden corpus C4a: the matchUpFormat grammar as a direct source.
 *
 * `parse`, `stringify`, `isValidMatchUpFormat` and `isAggregateFormat` are pure functions. Tests
 * call them directly, so the invoke observer never sees them and the harvest left all five
 * grammar methods at zero. They are also what every brief named as the port's beachhead. This
 * source writes them as directives with the return VALUE recorded (schema: `SuccessResult.value`),
 * because for a pure function the value is the whole spec. The envelope's initial state is a
 * minimal record; the steps change nothing, their patches are empty and their hashes constant.
 *
 * Inputs: the fixture formats, every distinct format the harvested corpus contains (when a
 * harvest is present), and an authored list of edge and invalid codes. `GRAMMAR_ROUND_TRIP` is
 * recorded when `stringify(parse(code)) === code`.
 */
export const EDGE_CODES = [
  '',
  'SET3',
  'SET3-S:6',
  'SET3-S:6/TB7',
  'SET3-S:6/TB7-F:6/TB10',
  'SET3-S:6/TB7-F:TB10',
  'SET3-S:6/TB7@5',
  'SET3-S:6NOAD/TB7',
  'SET3-S:6/TB7NOAD',
  'SET1-S:8/TB7@7',
  'SET1-S:T30',
  'SET1-S:T20P',
  'SET1-S:TB10',
  'SET5-S:6/TB7',
  'SET2-S:6/TB7',
  'SET4-S:6/TB7',
  'SET3-S:6/TB7-F:',
  'SET3-S:6/TB7-F:6/TB',
  'set3-s:6/tb7',
  'SET3-S:6/TB7 ',
  'SET3-S:6/TB7-G:S:4',
  'SET3-S:6/TB7-M:T60',
  'SET3-S:6/TB7-A',
  'SET1-S:T30@2',
  'SET3-S:6/TB7-XYZ',
  'SET3-S:60/TB7',
  'SET3-S:6/TB0',
  'SET0-S:6/TB7',
  'SET3-S:6/TB7-F:4/TB7-F:6/TB7',
];

// Scenario ids must be unique. A clean code (the grammar's own alphabet) slugs readably; anything
// else, a trailing space, a lowercase letter, an unknown modifier, carries a short hash so that
// 'SET3-S:6/TB7 ' and 'SET3-S:6/TB7' cannot share an id (they did, once).
function slug(code: string): string {
  if (!code) return 'empty';
  const readable =
    code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x';
  if (/^[A-Z0-9:/@-]+$/.test(code)) return readable;
  return `${readable}-${createHash('sha256').update(code).digest('hex').slice(0, 8)}`;
}

/** The fixture formats, the harvested corpus's formats (if any), and the edge codes, deduplicated. */
export function grammarInputs(harvestDir?: string): string[] {
  const codes = new Set<string>();
  for (const value of Object.values(fixtureFormats)) if (typeof value === 'string') codes.add(value);
  if (harvestDir && fs.existsSync(harvestDir)) {
    const re = /"matchUpFormat":"([^"]*)"/g;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.jsonl') && !entry.name.startsWith('_')) {
          const text = fs.readFileSync(full, 'utf8');
          let match: RegExpExecArray | null;
          while ((match = re.exec(text))) codes.add(match[1]);
        }
      }
    };
    walk(harvestDir);
  }
  for (const code of EDGE_CODES) codes.add(code);
  return [...codes].sort((a, b) => a.localeCompare(b));
}

type Step = { directive: { method: string; params: any }; result: any; patch: never[]; hash: string };

function valued(value: unknown) {
  return value === undefined ? { success: true } : { success: true, value: canonicalObject(value) };
}

/** The four grammar steps for one code. The parsed object feeds stringify and isAggregateFormat. */
export function grammarSteps(code: string, hash: string): Step[] {
  const parsed = parse(code);
  return [
    { directive: { method: 'parse', params: { matchUpFormat: code } }, result: valued(parsed), patch: [], hash },
    {
      directive: { method: 'stringify', params: { matchUpFormat: code } },
      result: valued(parsed ? stringify(parsed) : undefined),
      patch: [],
      hash,
    },
    {
      directive: { method: 'isValidMatchUpFormat', params: { matchUpFormat: code } },
      result: valued(isValidMatchUpFormat({ matchUpFormat: code })),
      patch: [],
      hash,
    },
    {
      directive: { method: 'isAggregateFormat', params: { matchUpFormat: code } },
      result: valued(parsed ? isAggregateFormat(parsed) : undefined),
      patch: [],
      hash,
    },
  ];
}

export function grammarScenario(code: string) {
  const record = { tournamentId: 'corpus-grammar' };
  const hash = canonicalHash(record);
  const steps = grammarSteps(code, hash);
  const parsed = parse(code);
  const roundTrip = !!parsed && stringify(parsed) === code;
  let kind = 'invalid';
  if (roundTrip) kind = 'canonical';
  else if (parsed) kind = 'non-canonical';
  return {
    corpusVersion: 1,
    factoryVersion: factoryVersion(),
    schemaWriteMode: getSchemaWriteMode(),
    canonicalization: 'RFC8785',
    scenarioId: `grammar/${slug(code)}`,
    source: { kind: 'authored', ref: `grammar ${JSON.stringify(code)}` },
    tags: ['grammar', kind],
    initial: { record, hash },
    steps,
    invariants: [],
    properties: roundTrip ? ['GRAMMAR_ROUND_TRIP'] : [],
  };
}

export function recordGrammar({ outDir, harvestDir }: { outDir: string; harvestDir?: string }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'grammar.jsonl');
  const scenarios = grammarInputs(harvestDir).map(grammarScenario);
  fs.writeFileSync(outPath, scenarios.map((s) => JSON.stringify(s)).join('\n') + '\n');
  return scenarios;
}

/** Recompute every value with the helpers and compare canonically: the grammar's engine replay. */
export function replayGrammar(scenario: any): { step: number; expected: string; actual: string }[] {
  const mismatches: { step: number; expected: string; actual: string }[] = [];
  const code = scenario.steps[0]?.directive.params.matchUpFormat;
  const fresh = grammarSteps(code, scenario.initial.hash);
  scenario.steps.forEach((step: any, index: number) => {
    const expected = canonicalJson(step.result);
    const actual = canonicalJson(fresh[index]?.result ?? null);
    if (expected !== actual) mismatches.push({ step: index, expected, actual });
  });
  return mismatches;
}
