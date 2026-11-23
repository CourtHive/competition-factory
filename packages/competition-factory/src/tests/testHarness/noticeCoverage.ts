import { afterAll, beforeEach, expect } from 'vitest';
import { relative } from 'node:path';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Opt-in: `NOTICE_COVERAGE=1 pnpm vitest run` checks every engine call in the suite against the
 * notice-conformance rules and appends one JSON line per test file to `NOTICE_COVERAGE_OUT`
 * (default `.notice-coverage/tally.jsonl`, ignored by git). `node scripts/noticeCoverageReport.mjs`
 * summarises it. Without the variable this file does nothing.
 *
 * Read the run from its tally, not its exit code: every topic is subscribed, so the few tests that assert what
 * happens with NO subscription (e.g. deleteDrawDefinitions' unsubscribed AUDIT path) fail under it by design.
 */
const enabled = process.env.NOTICE_COVERAGE === '1';

if (enabled) {
  const { NoticeCoverageCollector } = await import('./noticeCoverage/collector');
  const outFile = process.env.NOTICE_COVERAGE_OUT ?? '.notice-coverage/tally.jsonl';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const collector = new NoticeCoverageCollector(outFile);
  collector.install(); // also counts engine calls made before the first test (beforeAll, module level)

  beforeEach(() => {
    const { testPath, currentTestName } = expect.getState();
    collector.testFile = relative(process.cwd(), testPath ?? '');
    collector.testName = currentTestName ?? '';
    collector.install();
  });

  afterAll(() => collector.flush());
}
