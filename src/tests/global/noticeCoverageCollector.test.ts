import { NoticeCoverageCollector } from '@Tests/testHarness/noticeCoverage/collector';
import { getInvokeObserver, setInvokeObserver } from '@Global/state/globalState';
import { QueryPurityCheck } from '@Tests/testHarness/queryPurity/checker';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// The opt-in notice-coverage collector (testHarness/noticeCoverage.ts) builds one collector per test file, but under
// `isolate: false` the provider object is shared and keeps the mirrors the first file installed. A later file's
// collector must still be handed the notices its calls announce, or every call it measures reads as silent.

const observer = getInvokeObserver();
afterEach(() => setInvokeObserver(observer));

function tallyOf(collector: NoticeCoverageCollector) {
  const outFile = path.join(fs.mkdtempSync(path.join(tmpdir(), 'notice-coverage-')), 'tally.jsonl');
  (collector as any).outFile = outFile;
  collector.flush();
  return JSON.parse(fs.readFileSync(outFile, 'utf8')).methods;
}

function addEventCall(collector: NoticeCoverageCollector) {
  mocksEngine.generateTournamentRecord({ setState: true });
  collector.install();
  const result = tournamentEngine.addEvent({ event: { eventName: 'Added' } });
  expect(result.success).toEqual(true);
  return tallyOf(collector).addEvent;
}

it('hands a second collector the notices of its own calls, on a provider the first one mirrored', () => {
  const first = new NoticeCoverageCollector('');
  const firstTally = addEventCall(first);
  expect(firstTally).toMatchObject({ calls: 1, changed: 1, silent: 0 });

  const second = new NoticeCoverageCollector('');
  const secondTally = addEventCall(second);
  expect(secondTally).toMatchObject({ calls: 1, changed: 1, silent: 0 });
});

it('runs beside the query-purity check: no observer cycle, and both keep measuring', () => {
  // the setup order of a NOTICE_COVERAGE=1 run: both harnesses re-install before every test, each adopting the
  // other's observer as `previous` and wrapping the provider's addNotice over the other's wrapper
  const collector = new NoticeCoverageCollector('');
  const check = new QueryPurityCheck();
  mocksEngine.generateTournamentRecord({ setState: true });
  for (let test = 0; test < 3; test++) {
    collector.install();
    check.install();
  }
  const result = tournamentEngine.addEvent({ event: { eventName: 'Added' } });
  expect(result.success).toEqual(true);
  expect(tallyOf(collector).addEvent).toMatchObject({ calls: 1, changed: 1, silent: 0 });
  expect(check.take()).toEqual([]);
});
