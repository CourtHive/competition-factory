import { cellId, scaleCells, scaleScenario } from '@Tests/testHarness/corpus/schedulingScale';
import { schedulingScenarios } from '@Tests/testHarness/corpus/schedulingSources';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

/**
 * The differential (SCHEDULING_PIPELINE_VNEXT.md § 7, stage two): vNext's planner, from the view alone, must decide what
 * v1's timed scheduler decides with `dryRun: true`, at every `scheduleProfileRounds` step of every authored scheduling
 * scenario and every cell of the scale matrix. Each step is asked of the record as the scenario's earlier directives
 * leave it, so a later run is compared over what an earlier run wrote. The planner must also leave the records as it
 * found them.
 *
 * The scale matrix runs a sample of its cells by default; `SCHEDULING_DIFFERENTIAL=all` runs every cell.
 */

// what v1 reports and the plan holds under the same name
const COMPARED = [
  'recoveryTimeDeferredMatchUpIds',
  'dependencyDeferredMatchUpIds',
  'overLimitMatchUpDetails',
  'scheduleTimesRemaining',
  'skippedScheduleTimes',
  'matchUpScheduleTimes',
  'overLimitMatchUpIds',
  'scheduledMatchUpIds',
  'noTimeMatchUpIds',
  'requestConflicts',
] as const;

function currentRecords() {
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { [tournamentRecord.tournamentId]: tournamentRecord };
}

/** the plan and v1's dry run of one scheduleProfileRounds call, on the engine's records as they stand */
function compareStep(params: any) {
  const tournamentRecords = currentRecords();
  const before = JSON.stringify(tournamentRecords);
  const view: any = buildSchedulingView({ tournamentRecords, ...params });
  const expected: any = tournamentEngine.scheduleProfileRounds({ ...params, dryRun: true });

  if (view.error || expected.error) {
    expect(view.error).toEqual(expected.error);
    return 0;
  }
  const plan: any = planSchedule({ view, ...params });
  expect(JSON.stringify(tournamentRecords)).toEqual(before);

  for (const key of COMPARED) expect({ [key]: plan[key] }).toEqual({ [key]: expected[key] ?? {} });
  return Object.values(plan.scheduledMatchUpIds).flat().length;
}

/** runs a scenario's directives, comparing at each scheduleProfileRounds step; returns the matchUps the steps placed */
function differential(initialRecord: any, directives: any[]) {
  tournamentEngine.reset();
  tournamentEngine.setState(initialRecord, true);
  let placed = 0;
  let steps = 0;
  for (const { method, params = {} } of directives) {
    if (method === 'scheduleProfileRounds') {
      placed += compareStep(params);
      steps += 1;
    }
    tournamentEngine[method](params);
  }
  return { placed, steps };
}

const all = process.env.SCHEDULING_DIFFERENTIAL === 'all';

describe('the vNext plan decides what v1 decides', () => {
  const authored = schedulingScenarios().filter(({ directives }) =>
    directives.some(({ method }) => method === 'scheduleProfileRounds'),
  );

  it.each(authored.map((scenario) => [scenario.scenarioId, scenario]))('%s', (_, scenario: any) => {
    const { steps } = differential(scenario.initialRecord, scenario.directives);
    expect(steps).toBeGreaterThan(0);
  });

  const cells = scaleCells().filter((_, index) => all || index % 8 === 0);
  it.each(cells.map((cell) => [cellId(cell), cell]))('%s', (_, cell: any) => {
    const { initialRecord, directives } = scaleScenario(cell);
    const { placed, steps } = differential(initialRecord, directives);
    expect(steps).toEqual(1);
    // the comparison is over placements
    expect(placed).toBeGreaterThan(0);
  });
});
