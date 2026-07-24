import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const venueId = 'proj-venue';
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

function build(outcomes?: any[]) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION, outcomes }],
    endDate: '2024-05-03',
    venueProfiles,
    startDate,
  });
  competitionEngine.setState([tournamentRecord]);
  const { courts } = competitionEngine.getVenuesAndCourts();
  const firstRound = competitionEngine.allCompetitionMatchUps().matchUps.filter((m: any) => m.roundNumber === 1);
  return { tournamentId: tournamentRecord.tournamentId, courtId: courts[0].courtId, firstRound };
}

it('projects official + planned cells and detects double-booking conflicts without writing', () => {
  const { tournamentId, courtId, firstRound } = build();
  const [a, b, c, d] = firstRound;

  // A is officially placed first (so it has an official cell to be overridden)
  competitionEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      {
        tournamentId,
        matchUpId: a.matchUpId,
        schedule: { scheduledDate: startDate, scheduledTime: '08:00', courtId, courtOrder: 1, venueId },
      },
    ],
  });

  const placements = [
    {
      tournamentId,
      matchUpId: a.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '10:00', courtId, courtOrder: 2, venueId },
    },
    {
      tournamentId,
      matchUpId: b.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '09:00', courtId, courtOrder: 1, venueId },
    },
    {
      tournamentId,
      matchUpId: c.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '11:00', courtId, courtOrder: 5, venueId },
    },
    {
      tournamentId,
      matchUpId: d.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '12:00', courtId, courtOrder: 5, venueId },
    },
  ];
  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'Plan', placements },
  });

  const proj = competitionEngine.getScenarioScheduleProjection({ tournamentId, scenarioId });
  expect(proj.error).toBeUndefined();

  // A is overridden to the planned time — official state is NOT mutated
  const aCell = proj.scheduleCells.find((cell: any) => cell.matchUpId === a.matchUpId);
  expect(aCell.scenarioStatus).toEqual('planned');
  expect(aCell.scheduledTime).toEqual('10:00');
  expect(aCell.courtOrder).toEqual(2);
  expect(
    a.schedule?.scheduledTime ??
      competitionEngine.allCompetitionMatchUps().matchUps.find((m: any) => m.matchUpId === a.matchUpId).schedule
        .scheduledTime,
  ).toEqual('08:00');

  expect([...proj.plannedMatchUpIds].sort()).toEqual([a.matchUpId, b.matchUpId, c.matchUpId, d.matchUpId].sort());

  // C and D collide at courtOrder 5 on the same court/date
  const orderConflict = proj.conflicts.find((cf: any) => cf.reason === 'SAME_COURT_ORDER' && cf.courtOrder === 5);
  expect(orderConflict).toBeDefined();
  expect(orderConflict.matchUpIds.sort()).toEqual([c.matchUpId, d.matchUpId].sort());
});

it('projects official cells, resolves venue from court, and honors venueFilter', () => {
  const { tournamentId, courtId, firstRound } = build();
  const [a, b] = firstRound;

  // A is officially placed and NOT in the scenario → it appears as an 'official' cell
  competitionEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      {
        tournamentId,
        matchUpId: a.matchUpId,
        schedule: { scheduledDate: startDate, scheduledTime: '08:00', courtId, courtOrder: 1, venueId },
      },
    ],
  });

  // B is placed by the scenario with a courtId but NO venueId → resolved from the court
  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: {
      scenarioName: 'x',
      placements: [
        {
          tournamentId,
          matchUpId: b.matchUpId,
          schedule: { scheduledDate: startDate, scheduledTime: '09:00', courtId, courtOrder: 2 },
        },
      ],
    },
  });

  const proj = competitionEngine.getScenarioScheduleProjection({ tournamentId, scenarioId });
  expect(proj.scheduleCells.find((cell: any) => cell.matchUpId === a.matchUpId).scenarioStatus).toEqual('official');
  const bCell = proj.scheduleCells.find((cell: any) => cell.matchUpId === b.matchUpId);
  expect(bCell.scenarioStatus).toEqual('planned');
  expect(bCell.venueId).toEqual(venueId); // resolved from courtId via the court→venue map

  // venueFilter to a venue that holds none of the cells → nothing survives
  const filtered = competitionEngine.getScenarioScheduleProjection({
    tournamentId,
    scenarioId,
    venueIds: ['no-such-venue'],
  });
  expect(filtered.scheduleCells).toEqual([]);
});

it('projection keeps completed matchUps official and reports them as skipped', () => {
  const { tournamentId, courtId, firstRound } = build([
    { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  ]);
  const completed = competitionEngine.allCompetitionMatchUps().matchUps.find((m: any) => m.winningSide);
  const pending = firstRound.find((m: any) => !m.winningSide);

  const placements = [completed, pending].map((m: any) => ({
    tournamentId,
    matchUpId: m.matchUpId,
    schedule: { scheduledDate: startDate, scheduledTime: '14:00', courtId, courtOrder: 1, venueId },
  }));
  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'late', placements },
  });

  const proj = competitionEngine.getScenarioScheduleProjection({ tournamentId, scenarioId });
  expect(proj.skippedCompletedMatchUpIds).toContain(completed.matchUpId);
  expect(proj.plannedMatchUpIds).toContain(pending.matchUpId);
  expect(proj.plannedMatchUpIds).not.toContain(completed.matchUpId);
});

it('flags a scenario out of date when the official baseline drifts, and rebase clears it', () => {
  const { tournamentId, courtId, firstRound } = build();
  const [a, b] = firstRound;

  const placements = [a, b].map((m: any) => ({
    tournamentId,
    matchUpId: m.matchUpId,
    schedule: { scheduledDate: startDate, scheduledTime: '10:00', courtId, courtOrder: 1, venueId },
  }));
  const add = competitionEngine.addScheduleScenario({ tournamentId, scenario: { scenarioName: 'Plan', placements } });
  expect(add.scenario.basedOnHash).toBeDefined();

  const status1 = competitionEngine.getScheduleScenarioStatus({ tournamentId, scenarioId: add.scenarioId });
  expect(status1.outOfDate).toEqual(false);
  expect(status1.applicableMatchUpIds.sort()).toEqual([a.matchUpId, b.matchUpId].sort());

  // the official schedule of a plan matchUp changes → baseline drift
  competitionEngine.bulkScheduleMatchUps({
    matchUpDetails: [
      {
        tournamentId,
        matchUpId: a.matchUpId,
        schedule: { scheduledDate: startDate, scheduledTime: '15:00', courtId, courtOrder: 3, venueId },
      },
    ],
  });
  const status2 = competitionEngine.getScheduleScenarioStatus({ tournamentId, scenarioId: add.scenarioId });
  expect(status2.outOfDate).toEqual(true);

  // explicit rebase re-anchors to current state
  const rebased = competitionEngine.rebaseScheduleScenario({ tournamentId, scenarioId: add.scenarioId });
  expect(rebased.success).toEqual(true);
  const status3 = competitionEngine.getScheduleScenarioStatus({ tournamentId, scenarioId: add.scenarioId });
  expect(status3.outOfDate).toEqual(false);
});

it('status reports completed + missing placements; update preserves the baseline', () => {
  const { tournamentId, courtId, firstRound } = build([
    { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-2', winningSide: 1 },
  ]);
  const completed = competitionEngine.allCompetitionMatchUps().matchUps.find((m: any) => m.winningSide);
  const pending = firstRound.find((m: any) => !m.winningSide);

  const placements = [
    {
      tournamentId,
      matchUpId: completed.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '14:00', courtId, courtOrder: 1, venueId },
    },
    {
      tournamentId,
      matchUpId: pending.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '15:00', courtId, courtOrder: 2, venueId },
    },
    {
      tournamentId,
      matchUpId: 'bogus-matchup-id',
      schedule: { scheduledDate: startDate, scheduledTime: '16:00', courtId, courtOrder: 3, venueId },
    },
  ];
  const add = competitionEngine.addScheduleScenario({ tournamentId, scenario: { scenarioName: 'mixed', placements } });
  const baseline = add.scenario.basedOnHash;

  const status = competitionEngine.getScheduleScenarioStatus({ tournamentId, scenarioId: add.scenarioId });
  expect(status.completedMatchUpIds).toContain(completed.matchUpId);
  expect(status.missingMatchUpIds).toContain('bogus-matchup-id');
  expect(status.applicableMatchUpIds).toEqual([pending.matchUpId]);

  // editing the plan must not silently re-anchor the drift baseline
  const updated = competitionEngine.updateScheduleScenario({
    tournamentId,
    scenarioId: add.scenarioId,
    updates: { scenarioName: 'mixed v2' },
  });
  expect(updated.scenario.scenarioName).toEqual('mixed v2');
  expect(updated.scenario.basedOnHash).toEqual(baseline);
});
