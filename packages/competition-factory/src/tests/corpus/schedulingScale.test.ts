import { recordSchedulingScale, scaleCells } from '../testHarness/corpus/schedulingScale';
import { replayAsReader } from '../testHarness/corpus/replayScenario';
import { afterEach, expect, it } from 'vitest';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * The scheduling scale source. A smoke slice (one cell per draw type) always runs; the whole matrix runs with
 * `SCHEDULING_SCALE=1` (`CORPUS_OUT` to keep the scenarios). Every cell claims every scheduling property, so a cell the
 * writer refuses is a scheduler breaking one: the failure names the cell and the property.
 */
let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

const full = process.env.SCHEDULING_SCALE === '1';

it(`every ${full ? '' : 'smoke '}scale cell schedules without breaking a scheduling property`, () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-scheduling-scale-'));
  const all = scaleCells();
  const cells = full
    ? all
    : [...new Map(all.filter((cell) => cell.days === 2 && cell.limits).map((cell) => [cell.drawType, cell])).values()];
  const { written, failed } = recordSchedulingScale({ outDir, cells });
  // SCHEDULING_SCALE_FAILURES=<file> keeps every refused cell and its reason for triage
  if (process.env.SCHEDULING_SCALE_FAILURES)
    fs.writeFileSync(process.env.SCHEDULING_SCALE_FAILURES, JSON.stringify(failed, null, 1));
  expect(failed).toEqual([]);
  expect(written.length).toEqual(cells.length);
  for (const scenario of written) {
    const id = scenario.scenarioId;
    expect({ id, reader: replayAsReader(scenario) }).toEqual({ id, reader: [] });
    // the profile run placed something: a cell that schedules nothing proves nothing
    const profileStep = scenario.steps.find((step: any) => step.directive.method === 'scheduleProfileRounds');
    const scheduled = Object.values(profileStep?.result?.value?.scheduledMatchUpIds ?? {}).flat();
    expect({ id, scheduled: scheduled.length > 0 }).toEqual({ id, scheduled: true });
  }
});
