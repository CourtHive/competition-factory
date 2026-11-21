// Inspect captured steps independently of any replay engine. Stream one JSONL file at a time.
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/ext/checkHarvestRefusals.mjs <harvest-directory>');
const counts = { scenarios: 0, steps: 0, refused: 0, aggregateQueues: 0, changed: 0 };
for (const file of (await readdir(dir)).sort()) {
  if (!file.endsWith('.jsonl') || file.startsWith('_')) continue;
  const lines = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const scenario = JSON.parse(line);
    let previous = scenario.initial.hash;
    counts.scenarios++;
    for (const [index, step] of scenario.steps.entries()) {
      counts.steps++;
      if (step.result.error) {
        counts.refused++;
        const { method, params } = step.directive;
        if (method === 'executionQueue' && params.methods.length > 1 && !params.rollbackOnError) {
          // No archived per-directive boundary in this aggregate step. Live suite instrumentation
          // checks the refusing directive even when earlier directives succeeded.
          counts.aggregateQueues++;
        } else if (step.hash !== previous || step.patch.length) {
          counts.changed++;
          console.log(
            JSON.stringify({
              file,
              scenario: scenario.scenarioId,
              index,
              method,
              error: step.result.error,
              previous,
              after: step.hash,
              paths: step.patch.map((op) => op.path),
            }),
          );
        }
      }
      previous = step.hash;
    }
  }
}
if (!counts.scenarios) throw new Error('No scenarios found');
console.error(JSON.stringify(counts));
if (counts.changed) process.exitCode = 1;
