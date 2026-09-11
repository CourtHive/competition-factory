import { getScenarioScheduleProjection } from '@Query/matchUps/scheduling/getScenarioScheduleProjection';
import { applyScheduleScenario } from '@Mutate/matchUps/schedule/applyScheduleScenario';
import { validateScheduleScenario } from '@Validators/validateScheduleScenario';
import { expect, it } from 'vitest';
import {
  computeScheduleFingerprint,
  getScheduleScenarioStatus,
} from '@Query/matchUps/scheduling/scheduleScenarioReconciliation';
import {
  rebaseScheduleScenario,
  removeScheduleScenario,
  updateScheduleScenario,
  getScheduleScenarios,
  addScheduleScenario,
  getScheduleScenario,
} from '@Mutate/tournaments/scheduleScenarios';

import {
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  SCHEDULE_SCENARIO_NOT_FOUND,
} from '@Constants/errorConditionConstants';

// Direct-import unit tests exercising the record-resolution and validation
// branches that the engine-level tests can't reach (single-record injection,
// unresolvable records, and every validator rejection).

it('resolves the scenario-bearing record from tournamentRecord alone (single-engine path)', () => {
  const tournamentRecord: any = { tournamentId: 't1', events: [] };

  const add = addScheduleScenario({ tournamentRecord, scenario: { scenarioName: 'A', placements: [] } });
  expect(add.success).toEqual(true);
  expect(tournamentRecord.scheduling.scenarios.length).toEqual(1);

  expect(getScheduleScenarios({ tournamentRecord }).scenarios?.length).toEqual(1);
  expect(getScheduleScenario({ tournamentRecord, scenarioId: add.scenarioId! }).scenario?.scenarioName).toEqual('A');

  const updated = updateScheduleScenario({ tournamentRecord, scenarioId: add.scenarioId!, updates: { notes: 'n' } });
  expect(updated.scenario?.notes).toEqual('n');

  expect(removeScheduleScenario({ tournamentRecord, scenarioId: add.scenarioId! }).success).toEqual(true);
});

it('returns MISSING_TOURNAMENT_RECORD when no single record can be resolved', () => {
  expect(getScheduleScenarios({}).error).toEqual(MISSING_TOURNAMENT_RECORD);
  expect(getScheduleScenario({ scenarioId: 'x' }).error).toEqual(MISSING_TOURNAMENT_RECORD);
  expect(addScheduleScenario({ scenario: { scenarioName: 'A', placements: [] } }).error).toEqual(
    MISSING_TOURNAMENT_RECORD,
  );
  expect(updateScheduleScenario({ scenarioId: 'x', updates: {} }).error).toEqual(MISSING_TOURNAMENT_RECORD);
  expect(removeScheduleScenario({ scenarioId: 'x' }).error).toEqual(MISSING_TOURNAMENT_RECORD);

  // multiple records without a tournamentId → ambiguous, cannot resolve
  const tournamentRecords: any = { a: { tournamentId: 'a' }, b: { tournamentId: 'b' } };
  expect(getScheduleScenarios({ tournamentRecords }).error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('applyScheduleScenario guards missing records and applies via the tournamentRecord path', () => {
  expect(applyScheduleScenario({ scenarioId: 'x' }).error).toEqual(MISSING_TOURNAMENT_RECORDS);

  const tournamentRecord: any = {
    tournamentId: 't1',
    events: [],
    scheduling: { scenarios: [{ scenarioId: 's1', scenarioName: 'A', placements: [] }] },
  };
  const result = applyScheduleScenario({ tournamentRecord, scenarioId: 's1' });
  expect(result.success).toEqual(true);
  expect(result.applied).toEqual(0);
});

it('rebase / projection / status error + record-resolution branches (direct)', () => {
  // no resolvable record
  expect(rebaseScheduleScenario({ scenarioId: 'x' }).error).toEqual(MISSING_TOURNAMENT_RECORD);

  const tournamentRecord: any = {
    tournamentId: 't1',
    events: [],
    scheduling: {
      scenarios: [
        {
          scenarioId: 's1',
          scenarioName: 'A',
          placements: [
            { tournamentId: 't1', matchUpId: 'm1', schedule: { scheduledDate: '2024-05-01', scheduledTime: '10:00' } },
          ],
        },
      ],
    },
  };

  // rebase: not found, then success (stamps a baseline hash)
  expect(rebaseScheduleScenario({ tournamentRecord, scenarioId: 'nope' }).error).toEqual(SCHEDULE_SCENARIO_NOT_FOUND);
  const rebased = rebaseScheduleScenario({ tournamentRecord, scenarioId: 's1' });
  expect(rebased.success).toEqual(true);
  expect(rebased.scenario?.basedOnHash).toBeDefined();

  // projection + status resolve the scenario or error
  expect(getScenarioScheduleProjection({ tournamentRecord, scenarioId: 'nope' }).error).toEqual(
    SCHEDULE_SCENARIO_NOT_FOUND,
  );
  expect((getScheduleScenarioStatus({ tournamentRecord, scenarioId: 'nope' }) as any).error).toEqual(
    SCHEDULE_SCENARIO_NOT_FOUND,
  );

  // a placement whose matchUp does not exist is reported missing; projection yields no cell
  const status: any = getScheduleScenarioStatus({ tournamentRecord, scenarioId: 's1' });
  expect(status.missingMatchUpIds).toContain('m1');
  expect(status.applicableMatchUpIds).toEqual([]);
  expect(getScenarioScheduleProjection({ tournamentRecord, scenarioId: 's1' }).scheduleCells).toEqual([]);

  // fingerprint over the tournamentRecord scope with a missing matchUp is still deterministic
  expect(typeof computeScheduleFingerprint({ tournamentRecord, matchUpIds: ['m1'] })).toEqual('string');
});

it('validateScheduleScenario rejects every malformed shape', () => {
  const bad = [
    { scenario: null },
    { scenario: [] },
    { scenario: { placements: [] } }, // missing scenarioName
    { scenario: { scenarioName: '   ' } }, // blank scenarioName
    { scenario: { scenarioName: 'a', scenarioId: 5, placements: [] } },
    { scenario: { scenarioName: 'a', scheduledDates: 'nope', placements: [] } },
    { scenario: { scenarioName: 'a', scheduledDates: ['2024-13-40'], placements: [] } },
    { scenario: { scenarioName: 'a', placements: 'nope' } },
    { scenario: { scenarioName: 'a', placements: [null] } },
    { scenario: { scenarioName: 'a', placements: [{ matchUpId: '', tournamentId: 't', schedule: {} }] } },
    { scenario: { scenarioName: 'a', placements: [{ matchUpId: 'm', tournamentId: '', schedule: {} }] } },
    { scenario: { scenarioName: 'a', placements: [{ matchUpId: 'm', tournamentId: 't', schedule: null }] } },
    {
      tournamentRecords: { t: {} } as any,
      scenario: { scenarioName: 'a', placements: [{ matchUpId: 'm', tournamentId: 'other', schedule: {} }] },
    },
  ];
  for (const args of bad) expect(validateScheduleScenario(args as any).valid).toEqual(false);

  // well-formed, with and without referential tournamentRecords
  expect(
    validateScheduleScenario({
      scenario: { scenarioName: 'a', placements: [{ matchUpId: 'm', tournamentId: 't', schedule: {} }] },
    }).valid,
  ).toEqual(true);
  expect(
    validateScheduleScenario({
      tournamentRecords: { t: {} } as any,
      scenario: {
        scenarioName: 'a',
        scheduledDates: ['2024-05-01'],
        placements: [{ matchUpId: 'm', tournamentId: 't', schedule: {} }],
      },
    }).valid,
  ).toEqual(true);
});
