import { mkdirSync, writeFileSync } from 'node:fs';
import { timingContext } from './shardTiming.mjs';
import { relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/** Small timing artifact alongside the native blob; never changes execution or test results. */
export default class ShardTimingReporter {
  onInit(vitest) {
    this.vitest = vitest;
    this.started = Date.now();
  }

  onTestRunEnd(modules, errors, reason) {
    try {
      this.writeReport(modules, errors, reason);
    } catch (error) {
      console.warn(`::warning::Shard timing artifact failed: ${error.message}`);
    }
  }

  writeReport(modules, errors, reason) {
    const config = this.vitest.config;
    const context = { ...timingContext(config), startedAt: new Date(this.started).toISOString() };
    const files = modules.map((module) => {
      const tests = [...module.children.allTests()];
      const diagnostics = module.diagnostic();
      return {
        path: relative(config.root, module.moduleId).split('\\').join('/'),
        seconds: diagnostics.duration / 1000,
        importSeconds: diagnostics.collectDuration / 1000,
        project: module.project.name,
        isolated: module.project.config.isolate,
        concurrencyId: diagnostics.concurrencyId,
        state: module.state(),
        tests: tests.length,
        caseHash: createHash('sha256')
          .update(JSON.stringify(tests.map((test) => [test.fullName, test.options.mode])))
          .digest('hex'),
        passed: tests.filter((test) => test.result().state === 'passed').length,
        skipped: tests.filter((test) => test.result().state === 'skipped').length,
      };
    });
    const report = {
      schema: 1,
      context,
      success: reason === 'passed' && errors.length === 0 && files.every((file) => file.state !== 'failed'),
      wallSeconds: (Date.now() - this.started) / 1000,
      files,
    };
    const target = `.vitest/timing/shard-${context.shard.index}.json`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  }
}
