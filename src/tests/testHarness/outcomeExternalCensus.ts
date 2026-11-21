import { appendFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { afterAll } from 'vitest';
// constants and types
import type { AbstainReason, Route } from '@Mutate/matchUps/outcome/types';
import type { Profiler } from 'node:inspector';
const reasons = new WeakMap<object, AbstainReason>();
const counts = new Map<string, number>();
const output = process.env.OUTCOME_EXTERNAL_CENSUS_JSONL;
const coverageOutput = process.env.OUTCOME_EXTERNAL_COVERAGE_JSONL;
const candidates = new WeakMap<object, Record<string, string[]>>();
const coverage = new Map<AbstainReason, Record<string, string[]>>();
let measuring = false;

export function markRecording(plan: object, reason: AbstainReason): void {
  if (output || coverageOutput) reasons.set(plan, reason);
}

export function countRecording(plan: object, drawType: string | undefined, route: Route | undefined): void {
  if (!output && !coverageOutput) return;
  const reason = reasons.get(plan);
  if (!reason) throw new Error('Recorded call without its pre-recording reason');
  const key = JSON.stringify([reason, drawType ?? '<none>', route ?? '<none>']);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  const executed = candidates.get(plan);
  if (executed && !coverage.has(reason)) coverage.set(reason, executed);
}

function executedWriters(scripts: Profiler.ScriptCoverage[]) {
  const files: Record<string, string[]> = {};
  for (const { url, functions } of scripts) {
    if (!url.startsWith('file:')) continue;
    const file = relative(process.cwd(), fileURLToPath(url));
    if (!file.startsWith('src/mutate/') || file.startsWith('src/mutate/matchUps/outcome/')) continue;
    const names = functions
      .filter(({ ranges }) => ranges[0]?.count)
      .map(({ functionName, ranges }) => functionName || `anonymous@${ranges[0].startOffset}`);
    if (names.length) files[file] = names;
  }
  return files;
}

export function measureRecording<T extends { written: object }>(
  run: () => T | undefined,
  reason: AbstainReason,
): T | undefined {
  if (!coverageOutput || coverage.has(reason) || measuring) return run();
  const session = new Session();
  session.connect();
  measuring = true;
  try {
    session.post('Profiler.enable');
    session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    const result = run();
    let scripts: Profiler.ScriptCoverage[] | undefined;
    session.post('Profiler.takePreciseCoverage', (error, answer) => {
      if (!error) scripts = answer.result;
    });
    if (!scripts) throw new Error('Precise coverage was unavailable');
    if (result) candidates.set(result.written, executedWriters(scripts));
    return result;
  } finally {
    session.post('Profiler.stopPreciseCoverage');
    session.disconnect();
    measuring = false;
  }
}

if (output || coverageOutput) {
  afterAll(() => {
    if (output && counts.size) appendFileSync(output, JSON.stringify(Object.fromEntries(counts)) + '\n');
    if (coverageOutput && coverage.size) {
      appendFileSync(coverageOutput, JSON.stringify(Object.fromEntries(coverage)) + '\n');
    }
    counts.clear();
    coverage.clear();
  });
}
