import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const [ledger, corpus] = process.argv.slice(2);
if (!ledger || !corpus)
  throw new Error('Usage: node triageHarvestDrift.mjs <replay-details.jsonl> <harvest-directory>');

async function* entries(file) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

const byFile = new Map();
for await (const entry of entries(ledger)) {
  if (entry.disagreement) continue;
  const scenarios = byFile.get(entry.file) ?? new Map();
  if (scenarios.has(entry.scenarioId)) throw new Error('Duplicate ledger identity: ' + entry.scenarioId);
  scenarios.set(entry.scenarioId, entry.v2);
  byFile.set(entry.file, scenarios);
}

function classify(scenario, mismatches) {
  if (!Array.isArray(mismatches)) return 'exception';
  if (mismatches.some(({ step }) => step < 0)) return 'initial hash differs';
  const resultDiffers = mismatches.some(({ step, result }) => {
    const expected = scenario.steps[step].result;
    return expected.error !== result.error || expected.success !== result.success;
  });
  if (resultDiffers) return 'directive result differs';
  // A matching step was omitted from the ledger. Its actual hash is the recorded one.
  const actualAt = new Map(mismatches.map(({ step, actual }) => [step, actual]));
  const stayedAtInitial = scenario.steps.every(
    ({ hash }, step) => (actualAt.get(step) ?? hash) === scenario.initial.hash,
  );
  if (stayedAtInitial) return 'result agrees and replay stays at initial state';
  return 'result agrees and replay changes state';
}

const totals = {};
const cases = [];
for (const [file, scenarios] of byFile) {
  for await (const scenario of entries(join(corpus, file))) {
    if (!scenarios.has(scenario.scenarioId)) continue;
    const mismatches = scenarios.get(scenario.scenarioId);
    scenarios.delete(scenario.scenarioId);
    const category = classify(scenario, mismatches);
    totals[category] = (totals[category] ?? 0) + 1;
    const first = Array.isArray(mismatches) ? mismatches[0] : undefined;
    const step = scenario.steps[first?.step];
    cases.push({
      file,
      scenarioId: scenario.scenarioId,
      category,
      ...(first ? { firstMismatch: first.step } : { exception: mismatches.exception }),
      ...(step
        ? {
            method: step.directive.method,
            expected: step.result.error ?? 'success',
            actual: first.result.error ?? 'success',
          }
        : {}),
    });
  }
  if (scenarios.size) throw new Error('Missing scenario in ' + file);
}
console.log(JSON.stringify({ scenarios: cases.length, files: byFile.size, totals, cases }, null, 2));
