import { runRecordSoak, soakOptions } from '@Tests/testHarness/outcome/recordSoak';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

/**
 * The record soak (`testHarness/outcome/recordSoak.ts`). INERT unless `SOAK=1`: the suite skips it in microseconds.
 *
 * One process per shard; the output is named after the shard, the arms and the pipeline mode, so the runs of one shard
 * under `v1`, `v2` and `differential` sit side by side in one directory and can be compared line for line:
 *
 *   SOAK=1 SOAK_RECORDS=<shard.jsonl> SOAK_OUT=<dir> SOAK_ARM=a|b|ab OUTCOME_PIPELINE=differential QUERY_PURITY=0 \
 *     npx vitest run src/tests/mutations/outcome/recordSoak.test.ts
 *
 *   <dir>/<shard>.<arms>.<mode>.events.jsonl    one line per call (SOAK_EVENTS=notok: only calls that were not ok)
 *   <dir>/<shard>.<arms>.<mode>.summary.json    counts by class x drawType x arm, calls/sec, ownership
 *
 * Arm (b): SOAK_SEED_START (1), SOAK_SEEDS (3) walks of SOAK_STEPS (20) per draw; SOAK_RELATIONAL=0 drops the sweep's
 * relational probes; SOAK_SHRINK=1 shrinks a walk whose finding was not already failing on the record as loaded.
 * Selection: SOAK_LIMIT, SOAK_OFFSET, SOAK_MAX_BYTES (skip longer lines), SOAK_RECORD and SOAK_DRAW (one id each).
 * SOAK_WHOLE_RECORD=1 loads the whole record for every draw instead of the record cut down to the draw's event.
 * SOAK_RAW=1 also writes raw messages, which can quote a record: only into a directory that may hold one.
 * SOAK_MIGRATE=1 runs `migrateTournamentRecord` on each record before it is replayed (the summary counts the records it
 * changed); unset, a record is replayed as stored, which is how every load path but the provider ingest finds it.
 * SOAK_FLUSH (200) is the number of event lines held before they are written: a slow draw shows progress.
 *
 * QUERY_PURITY=0 belongs on the command line: the purity check wraps every query the soak makes, and a query that
 * writes on a real record would fail this file after its output is written.
 *
 * A divergence does not fail the file. It is caught, counted and written; so is a refusal, and so is a throw.
 */

// `prepareDraw` builds its draw with the mocks engine: here it loads the record under soak instead
vi.mock('@Assemblies/engines/mock', async () => {
  const { soakDraw } = await import('@Tests/testHarness/outcome/recordSoakState');
  return { default: { generateTournamentRecord: () => soakDraw.load() } };
});

// what v2 decided for each call, read where the entry reads it: nothing is changed, only seen
vi.mock('@Mutate/matchUps/outcome/decide', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { decisionClass, soakDraw } = await import('@Tests/testHarness/outcome/recordSoakState');
  return {
    ...actual,
    decideOutcomeV2: (...args: any[]) => {
      const decided = actual.decideOutcomeV2(...args);
      soakDraw.decisions.push(decisionClass(decided));
      return decided;
    },
  };
});

// v1's writer on the stored record, counted as the owned-call tests count it (`directionCounter.ts`)
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

const enabled = process.env.SOAK === '1';
const options = soakOptions();

// the engine's catch path logs a call's whole parameters, and the harness below it may log too: none of it is kept
const silenced = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => ({ method, calls: 0 }));
const spies: { mockRestore: () => void }[] = [];
beforeAll(() => {
  if (!enabled) return;
  for (const entry of silenced)
    spies.push(
      vi.spyOn(console, entry.method).mockImplementation(() => {
        entry.calls += 1;
      }),
    );
});
afterAll(() => spies.forEach((spy) => spy.mockRestore()));

test.skipIf(!enabled)(
  `record soak ${options.arms} ${options.recordsFile}`,
  () => {
    expect(options.recordsFile, 'SOAK_RECORDS names a JSONL shard').not.toEqual('');
    expect(options.outDir, 'SOAK_OUT names a directory').not.toEqual('');
    let result: any = runRecordSoak(options);
    expect(result.recordsTaken).toBeGreaterThan(0);
    result = Object.fromEntries(silenced.map(({ method, calls }) => [method, calls]));
    expect(result).toBeDefined();
  },
  1000 * 60 * 60 * 48,
);
