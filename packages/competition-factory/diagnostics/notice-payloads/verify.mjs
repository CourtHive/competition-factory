import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { test } = await import('node:test');
// An explicit ordinary dist path supports independent comparisons to an already-built package.
const dist = resolve(process.argv[2] ?? 'dist');

const engines = [
  ['ordinary CJS', require(resolve(dist, 'index.js')), false],
  ['ordinary ESM', await import(pathToFileURL(resolve(dist, 'esm/index.mjs'))), false],
  ['diagnostic CJS', require('../../.diagnostics/notice-payloads/index.cjs'), true],
  ['diagnostic ESM', await import('../../.diagnostics/notice-payloads/index.mjs'), true],
];
for (const [label, { globalState: state }, diagnostic] of engines) {
  await test(label, async () => {
    const original = state.getProvider();
    const previousMode = state.getOutcomePipeline();
    const item = { n: 1 };
    const payload = { item, alias: item };
    const notice = { topic: 'audit', payload };
    let seen;
    try {
      state.setStateProvider({
        ...original,
        addNotice(input) {
          seen = input;
        },
        async callListener({ payloads }) {
          await Promise.resolve();
          // A same-value write distinguishes interception from a before/after comparison.
          payloads[0].item.n = 1;
        },
      });
      const passive = () => {
        assert.equal(state.setOutcomePipeline('differential').success, true);
        state.addNotice(notice);
        assert.equal(seen, notice);
        assert.equal(seen.payload.item, item);
        const copy = structuredClone(seen.payload);
        assert.equal(copy.item, copy.alias);
      };
      passive();
      if (diagnostic) {
        assert.equal(state.setOutcomePipeline('differential', { checkNoticePayloadWrites: true }).success, true);
        state.addNotice(notice);
        const held = seen.payload;
        assert.notEqual(held.item, item);
        assert.equal(held.item, held.alias);
        assert.throws(() => {
          held.item.n = 1;
        }, /read-only notice payload/);
        await assert.rejects(state.callListener({ topic: 'audit', payloads: [payload] }), /read-only notice payload/);
        passive();
        assert.throws(() => Reflect.deleteProperty(held.alias, 'missing'), /read-only notice payload/);
      }
    } finally {
      state.setStateProvider(original);
      state.setOutcomePipeline(previousMode);
    }
  });
}
