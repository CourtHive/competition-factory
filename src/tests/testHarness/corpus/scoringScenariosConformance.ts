import { scoringEngineScenario, slug, type ScoringAction } from './scoringScenarios';
import { cellOf } from './scoringScenariosTimeline';
import { createHash } from 'node:crypto';
import addFormats from 'ajv-formats';
import { expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import Ajv from 'ajv';

/**
 * Golden corpus SE3, the conformance cells: every case `conforms` and `segmentConforms` hold the engine
 * to, emitted as an authored corpus scenario tagged with its matrix cell.
 *
 * The capture is a hook the two helpers call once their assertions have passed, active only when
 * `CORPUS_CONFORMANCE_OUT` names a directory (`pnpm corpus:scoring` sets it). Without it the hook returns
 * at once and the suite is unchanged. The cases themselves stay where they are, written from the rule:
 * the hook reads the format and the stream the helper was given and replays the stream "as played"
 * through a fresh engine under the corpus clock, recording each step's result. The other four ways a
 * case is held (spelled, mirrored, corrected, reloaded) are the timeline scenarios' to pin.
 *
 * A scenario's id is `scoring/conformance/<cell>/<case file>/<format>-<hash of format and stream>`: the
 * same case conformed twice in one file is recorded once, and a case added or moved does not renumber
 * the others. Each case file writes its own `conformance-<file>.jsonl`, so the files may run in parallel.
 */

const OUT_ENV = 'CORPUS_CONFORMANCE_OUT';
const written = new Set<string>();
const opened = new Set<string>();
let validate: ((value: unknown) => boolean) & { errors?: unknown };
let ajv: Ajv;

function validator() {
  if (!validate) {
    const schema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', 'utf8'));
    ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  }
  return validate;
}

export function conformanceScenarioId(format: string, spec: string, caseFile: string) {
  const digest = createHash('sha256').update(`${format}\n${spec}`).digest('hex').slice(0, 10);
  return `scoring/conformance/${slug(cellOf(format))}/${slug(caseFile)}/${slug(format)}-${digest}`;
}

/** Record one conformance case as a corpus scenario, when the corpus asks for them. */
export function captureConformanceCase(args: {
  helper: string;
  format: string;
  spec: string;
  actions: ScoringAction[];
}) {
  const outDir = process.env[OUT_ENV];
  if (!outDir) return;
  const { helper, format, spec, actions } = args;
  const { testPath = '', currentTestName = '' } = expect.getState();
  const caseFile = path.basename(testPath).replace(/\.conformance\.test\.ts$/, '');
  const scenarioId = conformanceScenarioId(format, spec, caseFile);
  if (written.has(scenarioId)) return;
  written.add(scenarioId);

  const cell = cellOf(format);
  const scenario = scoringEngineScenario({
    scenarioId,
    ref: `${path.relative(process.cwd(), testPath)} > ${currentTestName}: ${helper}('${format}', '${spec}') in cell ${cell}`,
    matchUpFormat: format,
    actions,
    tags: ['conformance', slug(cell)],
  });
  const check = validator();
  if (!check(scenario)) throw new Error(`${scenarioId}: ${ajv.errorsText(check.errors as any)}`);

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `conformance-${slug(caseFile)}.jsonl`);
  if (!opened.has(outPath)) {
    fs.writeFileSync(outPath, '');
    opened.add(outPath);
  }
  fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
}
