import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { CORE_METHODS, CORE_METHOD_SOURCES } from '../testHarness/corpus/coreMethods';
import { CorpusRecorder } from '../testHarness/corpus/recorder';
import { getInvokeObserver } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * C2a: the recorder turns an ordinary test's engine calls into a scenario that the C1c
 * replayers accept. Run in-process against a temp dir, then torn down, so it never records the
 * rest of the suite.
 */
let recorder: CorpusRecorder | undefined;
let outDir = '';

afterEach(() => {
  recorder?.stop();
  recorder = undefined;
  setRandomSource();
  setClock();
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

function drive() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const first = matchUps.filter((m: any) => m.roundNumber === 1);
  const score = (m: any, scoreString: string, winningSide: number) =>
    tournamentEngine.setMatchUpStatus({
      outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide }).outcome,
      matchUpId: m.matchUpId,
      drawId: m.drawId,
    });
  expect(score(first[0], '6-1 6-1', 1).success).toEqual(true);
  expect(score(first[1], '6-2 6-2', 2).success).toEqual(true);
  expect(
    tournamentEngine.setMatchUpStatus({ drawId: first[0].drawId, matchUpId: 'nope', outcome: { winningSide: 1 } })
      .error,
  ).toBeDefined();
  expect(tournamentEngine.allTournamentMatchUps().matchUps.length).toBeGreaterThan(0); // a query: not recorded
}

it('derives a core set from the governors, mutations and generation only', () => {
  expect(CORE_METHODS.size).toBeGreaterThan(80);
  expect(CORE_METHODS.has('setMatchUpStatus')).toEqual(true);
  expect(CORE_METHODS.has('generateDrawDefinition')).toEqual(true);
  expect(CORE_METHODS.has('allTournamentMatchUps')).toEqual(false);
  expect(Object.keys(CORE_METHOD_SOURCES)).toContain('scoreGovernor/mutate');
  // a renamed export is harvested under the engine's name, not the module's
  expect(CORE_METHODS.has('isValid')).toEqual(true);
});

it.skipIf(process.env.CORPUS_RECORD === '1')(
  'records a test into a scenario the replayers accept, skipping queries and ending at the test',
  () => {
    outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-'));
    recorder = new CorpusRecorder({ outDir });
    expect(getInvokeObserver()).toBeTypeOf('function');
    recorder.beginTest({
      file: 'src/tests/corpus/recorder.test.ts',
      name: 'recorded sample',
      seed: 424242,
      ordinal: 1,
    });
    drive();
    recorder.endTest();
    const [stats] = recorder.flushSummary();
    expect(stats).toMatchObject({ tests: 1, scenarios: 1, steps: 3, invalid: 0 });

    const file = fs.readdirSync(outDir).find((f) => f.endsWith('.jsonl') && !f.startsWith('_'));
    const [line] = fs.readFileSync(path.join(outDir, file!), 'utf8').trim().split('\n');
    const scenario = JSON.parse(line);
    expect(scenario.scenarioId).toEqual('recorded/src/tests/corpus/recorder/recorded-sample');
    expect(scenario.source).toEqual({
      kind: 'recorded-test',
      ref: 'src/tests/corpus/recorder.test.ts::recorded sample',
    });
    expect(scenario.steps.map((s: any) => s.directive.method)).toEqual([
      'setMatchUpStatus',
      'setMatchUpStatus',
      'setMatchUpStatus',
    ]);
    expect(scenario.steps[2].result.error).toMatch(/^ERR_/);
    expect(scenario.steps[2].patch).toEqual([]);
    expect(scenario.steps[0].coordinates).toMatchObject({ roundNumber: 1, eventIndex: 0, drawIndex: 0 });
    expect(scenario.invariants).toEqual(['PARTICIPANT_DUPLICATED_IN_STRUCTURE', 'BYE_POSITION_WITH_PARTICIPANT']);
    expect(scenario.tags).toEqual(['recorded']); // seeded under vitest, so replay is exact
    expect(typeof scenario.seed).toEqual('number');
    expect(Math.abs(Date.parse(scenario.clock) - Date.now())).toBeLessThan(60_000);
    expect(scenario.clockTickMs).toEqual(1);

    recorder.stop();
    recorder = undefined;
    expect(replayAsReader(scenario)).toEqual([]);
    expect(replayThroughEngine(scenario)).toEqual([]);
  },
);

it.skipIf(process.env.CORPUS_RECORD === '1')(
  'skips, with the reason, a test whose first core call sees several tournament records',
  () => {
    outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-'));
    recorder = new CorpusRecorder({ outDir });
    recorder.beginTest({ file: 'src/tests/corpus/recorder.test.ts', name: 'two records', seed: 1, ordinal: 1 });
    const a = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] }).tournamentRecord;
    const b = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] }).tournamentRecord;
    tournamentEngine.setState([a, b]);
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ tournamentId: a.tournamentId });
    tournamentEngine.setMatchUpStatus({
      tournamentId: a.tournamentId,
      drawId: matchUps[0].drawId,
      matchUpId: matchUps[0].matchUpId,
      outcome: { winningSide: 1 },
    });
    recorder.endTest();
    const [stats] = recorder.flushSummary();
    expect(stats.scenarios).toEqual(0);
    expect(stats.skipped).toEqual({ 'tournament-records-2': 1 });
  },
);

it.skipIf(process.env.CORPUS_RECORD === '1')('starts a new scenario after an unrecorded draw insertion', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    nonRandom: 7,
    setState: true,
  });
  outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-'));
  recorder = new CorpusRecorder({ outDir });
  recorder.beginTest({ file: 'draw.test.ts', name: 'insert between calls', seed: 7, ordinal: 1 });
  const generate = () => tournamentEngine.generateDrawDefinition({ eventId, drawSize: 4 });
  const { drawDefinition } = generate();
  expect(tournamentEngine.addDrawDefinition({ eventId, drawDefinition }).success).toBe(true);
  expect(generate().drawDefinition).toBeDefined();
  recorder.endTest();
  recorder.stop();
  const [stats] = recorder.flushSummary();
  expect(stats).toMatchObject({ tests: 1, scenarios: 2, steps: 2, invalid: 0 });
  const file = fs.readdirSync(outDir).find((name) => name.endsWith('.jsonl') && !name.startsWith('_'))!;
  for (const line of fs.readFileSync(path.join(outDir, file), 'utf8').trim().split('\n')) {
    const scenario = JSON.parse(line);
    expect(replayAsReader(structuredClone(scenario))).toEqual([]);
    expect(replayThroughEngine(scenario)).toEqual([]);
  }
});
