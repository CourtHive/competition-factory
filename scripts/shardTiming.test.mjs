import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { calibrate, markdown, mergeTimings } from './shardTiming.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const inventory = [1, 2, 3, 4].map((index) => `src/file${index}.test.ts`);
function shards(day = 1) {
  return inventory.map((path, index) => ({
    schema: 1,
    success: true,
    wallSeconds: day * 2,
    context: {
      ci: true,
      runId: String(day),
      sha: `sha${day}`,
      startedAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`,
      tier: 'full',
      pipeline: 'differential',
      node: 'v26.0.0',
      vitest: '5.0.5',
      platform: 'linux',
      architecture: 'x64',
      imageOS: 'ubuntu24',
      imageVersion: '1',
      cpuModels: ['cpu'],
      cpuCount: 4,
      availableParallelism: 4,
      requestedWorkers: 'default',
      resolvedMaxWorkers: 4,
      measurement: 'vitest-module-diagnostic-v1',
      shard: { index: index + 1, count: 4 },
    },
    files: [
      {
        path,
        seconds: day,
        importSeconds: 0.1,
        state: 'passed',
        tests: 1,
        caseHash: 'a'.repeat(64),
        passed: 1,
        skipped: 0,
      },
    ],
  }));
}
const report = (day) => mergeTimings(shards(day), inventory, {}, true);

test('reports unknown weights, slow suites and drift without changing verification', () => {
  const data = shards(10),
    weights = Object.fromEntries(inventory.slice(0, 3).map((path) => [path, 1]));
  const result = mergeTimings(data, inventory, weights, true);
  assert.deepEqual(result.missingWeights, [inventory[3]]);
  assert.equal(result.drift.length, 3);
  assert.equal(result.success, true);
  assert.equal(result.files.length, 4);
  assert.match(markdown(result), /Unweighted files: \*\*1\*\*/);
  assert.deepEqual(
    result.loads.map((load) => load.testSeconds),
    [10, 10, 10, 10],
  );
});

test('rejects missing, duplicate, wrong-run, incomplete and invalid shard evidence', () => {
  assert.throws(() => mergeTimings(shards().slice(1), inventory), /four timing/);
  for (const mutate of [
    (data) => {
      data[0].context.shard.index = 2;
    },
    (data) => {
      data[0].files[0].path = inventory[1];
    },
    (data) => {
      data[0].context.sha = 'other';
    },
    (data) => {
      data[0].files = [];
    },
    (data) => {
      data[0].success = false;
    },
    (data) => {
      data[0].files[0].seconds = NaN;
    },
    (data) => {
      data[0].files[0].importSeconds = -1;
    },
    (data) => {
      data[0].files[0].state = 'pending';
    },
  ]) {
    const data = shards();
    mutate(data);
    assert.throws(() => mergeTimings(data, inventory));
  }
});

test('uses the latest five whole CI runs, independent of input order', () => {
  const inputs = [7, 2, 4, 1, 6, 3, 5].map(report);
  const result = calibrate(inputs, inventory, 'full');
  assert.deepEqual(Object.values(result.weights), [5, 5, 5, 5]);
  assert.deepEqual(
    result.provenance.runs.map((run) => run.runId),
    ['7', '6', '5', '4', '3'],
  );
  assert.deepEqual(calibrate(inputs.toReversed(), inventory, 'full'), result);
});

test('requires independent verified CI observations in one tier, inventory and worker cohort', () => {
  assert.throws(() => calibrate([report(1)], inventory, 'full'), /two complete/);
  assert.throws(() => calibrate([report(1), report(1)], inventory, 'full'), /duplicate CI/);
  for (const mutate of [
    (data) => {
      data.coverageVerified = false;
    },
    (data) => {
      data.contexts = [];
    },
    (data) => {
      data.contexts[0].ci = false;
    },
    (data) => {
      data.contexts[0].requestedWorkers = '2';
    },
    (data) => {
      data.contexts[0].resolvedMaxWorkers = 2;
    },
    (data) => {
      data.contexts[0].backend = 'alternate';
    },
    (data) => {
      data.contexts[0].teamArms = true;
    },
    (data) => {
      data.contexts[0].timezone = 'different';
    },
    (data) => {
      data.context.tier = 'pr';
    },
    (data) => {
      data.files.pop();
    },
    (data) => {
      data.files[0].seconds = -1;
    },
    (data) => {
      data.loads.pop();
    },
  ]) {
    const inputs = [report(1), report(2)];
    mutate(inputs[1]);
    assert.throws(() => calibrate(inputs, inventory, 'full'));
  }
});

test('new files and changed case inventories use fresh observations instead of stale medians', () => {
  const old = report(1),
    current = report(2);
  old.files.pop();
  old.inventory.pop();
  old.files[0].caseHash = 'b'.repeat(64);
  const result = calibrate([old, current], inventory, 'full');
  assert.equal(result.weights[inventory[0]], 2);
  assert.equal(result.weights[inventory[3]], 2);
  assert.deepEqual(result.provenance.singleObservationFiles, [inventory[0], inventory[3]]);
  assert.equal(result.weights[inventory[1]], 1.5);
});

test('CLI preserves the other tier and leaves weights untouched when evidence is rejected', () => {
  const directory = mkdtempSync(join(tmpdir(), 'factory-shard-test-'));
  try {
    mkdirSync(join(directory, 'src'));
    for (const file of inventory) writeFileSync(join(directory, file), '');
    const output = join(directory, 'weights.json');
    writeFileSync(output, JSON.stringify({ pr: { untouched: 42 } }));
    const inputs = [1, 2].map((day) => {
      const file = join(directory, `run-${day}.json`);
      writeFileSync(file, JSON.stringify(report(day)));
      return file;
    });
    const script = fileURLToPath(new URL('./shardTiming.mjs', import.meta.url));
    execFileSync(process.execPath, [script, 'calibrate', 'full', output, ...inputs], {
      cwd: directory,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
    assert.deepEqual(JSON.parse(readFileSync(output)).pr, { untouched: 42 });
    assert.deepEqual(Object.values(JSON.parse(readFileSync(output)).full), [1.5, 1.5, 1.5, 1.5]);
    const before = readFileSync(output, 'utf8'),
      bad = report(3);
    bad.contexts.pop();
    writeFileSync(inputs[0], JSON.stringify(bad));
    assert.notEqual(
      spawnSync(process.execPath, [script, 'calibrate', 'full', output, ...inputs], {
        cwd: directory,
        timeout: 30_000,
        killSignal: 'SIGKILL',
      }).status,
      0,
    );
    assert.equal(readFileSync(output, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
