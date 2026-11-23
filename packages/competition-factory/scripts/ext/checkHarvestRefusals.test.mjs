import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const script = fileURLToPath(new URL('./checkHarvestRefusals.mjs', import.meta.url));
const { tests } = JSON.parse(
  readFileSync(new URL('../../src/tests/testHarness/corpus/refusalAllowlist.json', import.meta.url)),
);

test('only the exact known source and changed fields receive its exception', async () => {
  const [source, rules] = Object.entries(tests).find(([, rules]) =>
    rules.some((rule) => rule.reason === 'cascadeWriteErrorsReachTheCaller'),
  );
  const rule = rules.find((rule) => rule.reason === 'cascadeWriteErrorsReachTheCaller');
  const dir = await mkdtemp(join(tmpdir(), 'refusal-controls-'));
  try {
    for (const [ref, paths, expected] of [
      [source, rule.paths.slice(0, 1), 0],
      [source + ' different test', rule.paths.slice(0, 1), 1],
      [source, [...rule.paths, '/unrelated'], 1],
      [source, [], 0],
    ]) {
      const scenario = {
        scenarioId: 'control',
        source: { ref },
        initial: { hash: 'before' },
        steps: [
          {
            directive: { method: rule.method, params: {} },
            result: { error: rule.error },
            hash: paths.length ? 'changed' : 'before',
            patch: paths.map((path) => ({ op: 'remove', path })),
          },
        ],
      };
      await writeFile(join(dir, 'test.jsonl'), JSON.stringify(scenario) + '\n');
      const run = spawnSync(process.execPath, [script, dir], { encoding: 'utf8', timeout: 10000 });
      assert.equal(run.status, expected, run.stderr);
      assert.equal(JSON.parse(run.stderr).unexpected, expected);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
