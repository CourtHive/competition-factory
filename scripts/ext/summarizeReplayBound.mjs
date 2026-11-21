import { createReadStream, globSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

async function* rows(file) {
  const input = createReadStream(file);
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function summarize(dir, ledger) {
  const differences = new Map();
  for await (const row of rows(ledger)) differences.set(row.file + '/' + row.scenarioId, row);
  const totals = {
    files: 0,
    scenarios: 0,
    steps: 0,
    modeDisagreements: 0,
    commonDrift: 0,
    initialHashMismatches: 0,
    postStepMismatches: 0,
    exceptions: 0,
  };
  const tests = new Set();
  const byFile = {};
  for (const file of globSync('src-*.jsonl', { cwd: dir }).sort()) {
    const counts = { scenarios: 0, steps: 0, modeDisagreements: 0, commonDrift: 0 };
    byFile[file] = counts;
    totals.files++;
    for await (const scenario of rows(join(dir, file))) {
      totals.scenarios++;
      counts.scenarios++;
      counts.steps += scenario.steps.length;
      totals.steps += scenario.steps.length;
      const key = file + '/' + scenario.scenarioId;
      const row = differences.get(key);
      if (!row) continue;
      differences.delete(key);
      if (row.disagreement) {
        totals.modeDisagreements++;
        counts.modeDisagreements++;
        continue;
      }
      totals.commonDrift++;
      counts.commonDrift++;
      tests.add(scenario.source.ref);
      if (!Array.isArray(row.v2)) totals.exceptions++;
      else
        for (const mismatch of row.v2) {
          if (mismatch.step < 0) totals.initialHashMismatches++;
          else totals.postStepMismatches++;
        }
    }
  }
  if (differences.size) throw new Error('Unmatched ledger rows: ' + differences.size);
  return { totals, tests, byFile };
}

const [baseDir, baseLedger, candidateDir, candidateLedger] = process.argv.slice(2);
if (!candidateLedger)
  throw new Error('Pass reference directory, reference ledger, candidate directory, candidate ledger');
const before = await summarize(baseDir, baseLedger);
const after = await summarize(candidateDir, candidateLedger);
const common = [...before.tests].filter((test) => after.tests.has(test));
const resolved = [...before.tests].filter((test) => !after.tests.has(test));
const introduced = [...after.tests].filter((test) => !before.tests.has(test));
console.log(
  JSON.stringify(
    {
      before: before.totals,
      after: after.totals,
      sourceTestsWithDrift: {
        before: before.tests.size,
        after: after.tests.size,
        both: common.length,
        resolved,
        introduced,
      },
      byFile: Object.fromEntries(
        Object.entries(before.byFile).map(([file, baseline]) => [
          file,
          { before: baseline, after: after.byFile[file] },
        ]),
      ),
    },
    null,
    2,
  ),
);
