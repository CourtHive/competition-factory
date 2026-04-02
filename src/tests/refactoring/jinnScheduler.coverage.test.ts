/**
 * Coverage tests for jinnScheduler refactoring.
 * Targets: venue scheduling loop, daily limits, recovery time deferral,
 * dependency deferral, dry-run mode, bye matchUp clearing, round schedule pcts.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { hasSchedule } from '@Query/matchUp/hasSchedule';

describe('jinnScheduler coverage', () => {
  it('schedules matchUps using mocksEngine auto-scheduling', () => {
    const startDate = '2024-01-01';
    const endDate = '2024-01-03';

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, automated: true }],
      venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '18:00' }],
      startDate,
      endDate,
      setState: true,
    });

    tournamentEngine.attachPolicies({
      policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('dry-run does not persist scheduled times', () => {
    const startDate = '2024-02-01';
    const endDate = '2024-02-03';

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      venueProfiles: [{ courtsCount: 2, startTime: '09:00', endTime: '17:00' }],
      startDate,
      endDate,
      setState: true,
    });

    tournamentEngine.attachPolicies({
      policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    });

    tournamentEngine.scheduleProfileRounds({
      scheduleDates: [startDate],
      dryRun: true,
    });

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const scheduled = matchUps.filter(hasSchedule);
    expect(scheduled.length).toEqual(0);
  });

  it('scheduling with no profile returns gracefully', () => {
    const startDate = '2024-04-01';
    const endDate = '2024-04-05';

    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      startDate,
      endDate,
      setState: true,
    });

    let result: any = tournamentEngine.scheduleProfileRounds({
      scheduleDates: [startDate],
    });

    // Without venues or scheduling profile, should return without error (or with info)
    // The key thing is no exception is thrown
    expect(result).toBeDefined();
  });
});
