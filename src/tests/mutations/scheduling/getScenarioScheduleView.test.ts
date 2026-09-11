import mocksEngine from '@Assemblies/engines/mock';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const venueId = 'view-venue';
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

it('getScenarioScheduleView renders the grid shape from the plan without mutating real state', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    endDate: '2024-05-03',
    venueProfiles,
    startDate,
  });
  competitionEngine.setState([tournamentRecord]);
  const { tournamentId } = tournamentRecord;
  const { courts } = competitionEngine.getVenuesAndCourts();
  const courtId = courts[0].courtId;
  const firstRound = competitionEngine.allCompetitionMatchUps().matchUps.filter((m: any) => m.roundNumber === 1);
  const [a, b] = firstRound;

  const placements = [
    {
      tournamentId,
      matchUpId: a.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '10:00', courtId, courtOrder: 1, venueId },
    },
    {
      tournamentId,
      matchUpId: b.matchUpId,
      schedule: { scheduledDate: startDate, scheduledTime: '11:00', courtId, courtOrder: 2, venueId },
    },
  ];
  const { scenarioId } = competitionEngine.addScheduleScenario({
    tournamentId,
    scenario: { scenarioName: 'Plan', placements },
  });

  const view = competitionEngine.getScenarioScheduleView({
    tournamentId,
    scenarioId,
    matchUpFilters: { scheduledDate: startDate },
    withCourtGridRows: true,
  });

  // grid-ready shape (same as competitionScheduleMatchUps)
  expect(Array.isArray(view.rows)).toEqual(true);
  expect(view.courtsData?.length).toBeGreaterThan(0);
  expect(view.courtPrefix).toBeDefined();

  // the plan's matchUps appear scheduled in the projected view
  const viewA = view.dateMatchUps.find((m: any) => m.matchUpId === a.matchUpId);
  expect(viewA?.schedule?.scheduledTime).toEqual('10:00');
  expect([...view.plannedMatchUpIds].sort()).toEqual([a.matchUpId, b.matchUpId].sort());

  // CRITICAL: the real engine state is untouched — official schedule still empty
  const real = competitionEngine.competitionScheduleMatchUps({ matchUpFilters: { scheduledDate: startDate } });
  const realA = (real.dateMatchUps ?? []).find((m: any) => m.matchUpId === a.matchUpId);
  expect(realA?.schedule?.scheduledTime).toBeUndefined();
  const liveA = competitionEngine.allCompetitionMatchUps().matchUps.find((m: any) => m.matchUpId === a.matchUpId);
  expect(liveA.schedule?.scheduledTime).toBeUndefined();
});

it('getScenarioScheduleView errors for an unknown scenario', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    venueProfiles,
    startDate,
    endDate: '2024-05-03',
  });
  competitionEngine.setState([tournamentRecord]);
  const result = competitionEngine.getScenarioScheduleView({
    tournamentId: tournamentRecord.tournamentId,
    scenarioId: 'nope',
  });
  expect(result.error).toBeDefined();
});
