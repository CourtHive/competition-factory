import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Tests/fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';

/**
 * A dry run of the profile scheduler as a preview (rain-day recovery R0): it writes nothing, it says
 * where each matchUp would go, and it can be asked under other daily limits. A wet run is unchanged.
 */
const venueId = 'venue1';
const startDate = '2022-01-01';

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
    eventProfiles: [{ drawProfiles: [{ drawSize: 8, idPrefix: 'p' }] }],
    endDate: '2022-01-03',
    startDate,
  });
  competitionEngine.setState(tournamentRecord);
  const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
  const { tournamentId, eventId, drawId, structureId } = matchUps[0];
  for (const roundNumber of [1, 2]) {
    const result = competitionEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber },
      scheduleDate: startDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }
  const roundOf = (roundNumber: number) =>
    matchUps.filter((matchUp: any) => matchUp.roundNumber === roundNumber).map(({ matchUpId }) => matchUpId);
  return { r1: roundOf(1), r2: roundOf(2) };
}

const stored = () => JSON.stringify(competitionEngine.getState().tournamentRecords);

describe('scheduleProfileRounds dry run as a preview', () => {
  it('writes nothing to the record, its audit included', () => {
    setup();
    const before = stored();
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate], dryRun: true });
    expect(result.success).toEqual(true);
    expect(result.scheduledMatchUpIds[startDate].length).toBeGreaterThan(0);
    expect(stored()).toEqual(before);

    // the control: a wet run does write the audit (a time item, with no AUDIT subscriber), so the dry run's silence is
    // the change, not an audit that never fired
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);
    const { tournamentRecord } = competitionEngine.getTournament();
    expect(tournamentRecord.timeItems?.some((item: any) => item.itemType === AUTO_SCHEDULING_AUDIT)).toEqual(true);
  });

  it('returns where each matchUp would go, by date and venue, and a wet run does not', () => {
    const { r1, r2 } = setup();
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate], dryRun: true });
    const placed = result.placements[startDate][venueId];
    expect(placed.map(({ matchUpId }) => matchUpId).sort()).toEqual([...result.scheduledMatchUpIds[startDate]].sort());
    expect(new Set(placed.map(({ matchUpId }) => matchUpId))).toEqual(new Set([...r1, ...r2]));
    for (const { matchUpId, scheduleTime } of placed) {
      expect(result.matchUpScheduleTimes[matchUpId]).toEqual(scheduleTime);
    }

    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate] });
    expect(result.success).toEqual(true);
    expect(result.placements).toBeUndefined();
  });

  it('runs under the daily limits it is given, without storing them', () => {
    const { r1, r2 } = setup();
    const limitsBefore = competitionEngine.getMatchUpDailyLimits().matchUpDailyLimits;

    // the records' limits (none, by policy): both rounds fit the day
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [startDate], dryRun: true });
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(r1.length + r2.length);

    // one singles a day: the second round cannot follow the first
    result = competitionEngine.scheduleProfileRounds({
      matchUpDailyLimits: { SINGLES: 1 },
      scheduleDates: [startDate],
      dryRun: true,
    });
    expect(result.success).toEqual(true);
    expect([...result.scheduledMatchUpIds[startDate]].sort()).toEqual([...r1].sort());
    expect(r2.every((matchUpId) => !result.scheduledMatchUpIds[startDate].includes(matchUpId))).toEqual(true);

    expect(competitionEngine.getMatchUpDailyLimits().matchUpDailyLimits).toEqual(limitsBefore);
  });
});
