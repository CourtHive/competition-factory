import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { SCHEDULE_SCENARIO_EXISTS, SCHEDULE_SCENARIO_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const venueId = 'scenario-venue';
const startDate = '2024-05-01';
const venueProfiles = [
  {
    venueName: 'Center',
    venueAbbreviation: 'CTR',
    idPrefix: 'ctr',
    startTime: '08:00',
    endTime: '20:00',
    courtsCount: 4,
    venueId,
  },
];

function buildTournament(outcomes?: any[]) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION, outcomes }],
    endDate: '2024-05-03',
    venueProfiles,
    startDate,
  });
  return tournamentRecord;
}

it('supports schedule scenario CRUD stored first-class on scheduling.scenarios', () => {
  const tournamentRecord = buildTournament();
  competitionEngine.setState([tournamentRecord]);
  const { tournamentId } = tournamentRecord;

  let result: any = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'Rain plan', scheduledDates: [startDate], placements: [] },
  });
  expect(result.success).toEqual(true);
  const scenarioId = result.scenarioId;
  expect(scenarioId).toBeDefined();

  // persisted first-class — NOT as an extension
  const state = competitionEngine.getState().tournamentRecords[tournamentId];
  expect(state.scheduling.scenarios.length).toEqual(1);
  expect(state.scheduling.scenarios[0].scenarioName).toEqual('Rain plan');
  expect((state.extensions ?? []).some((e: any) => e.value?.[0]?.scenarioId)).toEqual(false);

  // duplicate scenarioId rejected
  const dup = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioId, scenarioName: 'dup', placements: [] },
  });
  expect(dup.error).toEqual(SCHEDULE_SCENARIO_EXISTS);

  // update
  result = competitionEngine.updateScheduleScenario({
    tournamentId,
    scenarioId,
    updates: { scenarioName: 'Rain plan v2', notes: 'indoor' },
  });
  expect(result.success).toEqual(true);
  expect(result.scenario.scenarioName).toEqual('Rain plan v2');
  expect(result.scenario.notes).toEqual('indoor');

  // update missing → not found
  expect(competitionEngine.updateScheduleScenario({ tournamentId, scenarioId: 'nope', updates: {} }).error).toEqual(
    SCHEDULE_SCENARIO_NOT_FOUND,
  );

  // getScheduleScenario
  expect(competitionEngine.getScheduleScenario({ tournamentId, scenarioId }).scenario.scenarioName).toEqual(
    'Rain plan v2',
  );

  // remove
  result = competitionEngine.removeScheduleScenario({ tournamentId, scenarioId });
  expect(result.success).toEqual(true);
  expect(competitionEngine.getScheduleScenarios({ tournamentId }).scenarios.length).toEqual(0);

  // remove missing → not found
  expect(competitionEngine.removeScheduleScenario({ tournamentId, scenarioId }).error).toEqual(
    SCHEDULE_SCENARIO_NOT_FOUND,
  );
});

it('resolves the record without an explicit tournamentId when a single tournament is loaded', () => {
  const tournamentRecord = buildTournament();
  competitionEngine.setState([tournamentRecord]);

  const add = competitionEngine.addScheduleScenario({ scenario: { scenarioName: 'Solo', placements: [] } });
  expect(add.success).toEqual(true);
  expect(competitionEngine.getScheduleScenarios({}).scenarios.length).toEqual(1);
});

it('applyScheduleScenario commits placements as the official schedule', () => {
  const tournamentRecord = buildTournament();
  competitionEngine.setState([tournamentRecord]);
  const { tournamentId } = tournamentRecord;

  const firstRound = competitionEngine.allCompetitionMatchUps().matchUps.filter((m: any) => m.roundNumber === 1);
  const scheduleTimes = ['08:00', '09:00', '10:00', '11:00'];

  const placements = firstRound.map((m: any, i: number) => ({
    tournamentId,
    matchUpId: m.matchUpId,
    schedule: { scheduledDate: startDate, scheduledTime: scheduleTimes[i], courtOrder: i + 1, venueId },
  }));

  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'Plan A', placements },
  });

  // not yet applied — first-round matchUps carry no scheduledTime
  const before = competitionEngine
    .allCompetitionMatchUps()
    .matchUps.filter((m: any) => firstRound.some((f: any) => f.matchUpId === m.matchUpId));
  for (const m of before) expect(m.schedule?.scheduledTime).toBeUndefined();

  const result = competitionEngine.applyScheduleScenario({ tournamentId, scenarioId });
  expect(result.success).toEqual(true);
  expect(result.applied).toEqual(firstRound.length);

  const after = competitionEngine.allCompetitionMatchUps().matchUps;
  for (const p of placements) {
    const m = after.find((x: any) => x.matchUpId === p.matchUpId);
    expect(m.schedule.scheduledTime).toEqual(p.schedule.scheduledTime);
    expect(m.schedule.courtOrder).toEqual(p.schedule.courtOrder);
  }

  // scenario is left in place after commit
  expect(competitionEngine.getScheduleScenarios({ tournamentId }).scenarios.length).toEqual(1);

  // unknown scenarioId → not found
  expect(competitionEngine.applyScheduleScenario({ tournamentId, scenarioId: 'nope' }).error).toEqual(
    SCHEDULE_SCENARIO_NOT_FOUND,
  );
});

it('applyScheduleScenario skips completed matchUps', () => {
  const tournamentRecord = buildTournament([
    { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  ]);
  competitionEngine.setState([tournamentRecord]);
  const { tournamentId } = tournamentRecord;

  const matchUps = competitionEngine.allCompetitionMatchUps().matchUps;
  const completed = matchUps.find((m: any) => m.winningSide);
  const pending = matchUps.find((m: any) => m.roundNumber === 1 && !m.winningSide);
  expect(completed).toBeDefined();
  expect(pending).toBeDefined();

  const placements = [completed, pending].map((m: any) => ({
    tournamentId,
    matchUpId: m.matchUpId,
    schedule: { scheduledDate: startDate, scheduledTime: '14:00', courtOrder: 1, venueId },
  }));

  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'late', placements },
  });

  const result = competitionEngine.applyScheduleScenario({ tournamentId, scenarioId });
  expect(result.success).toEqual(true);
  expect(result.applied).toEqual(1); // only the pending matchUp scheduled

  const after = competitionEngine.allCompetitionMatchUps().matchUps;
  expect(after.find((m: any) => m.matchUpId === pending.matchUpId).schedule.scheduledTime).toEqual('14:00');
  expect(after.find((m: any) => m.matchUpId === completed.matchUpId).schedule?.scheduledTime).toBeUndefined();
});

it('rejects invalid schedule scenarios', () => {
  const tournamentRecord = buildTournament();
  competitionEngine.setState([tournamentRecord]);
  const { tournamentId } = tournamentRecord;

  // missing scenarioName
  expect(
    competitionEngine.addScheduleScenario({ tournamentId, scenario: { placements: [] } as any }).error,
  ).toBeDefined();

  // placement referencing an unknown tournamentId
  const bad = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'x', placements: [{ tournamentId: 'nope', matchUpId: 'm', schedule: {} }] },
  });
  expect(bad.error).toBeDefined();

  // invalid scheduledDates
  const badDates = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'x', scheduledDates: ['not-a-date'], placements: [] },
  });
  expect(badDates.error).toBeDefined();
});
