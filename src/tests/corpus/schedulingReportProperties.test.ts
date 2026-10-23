import { schedulingReport } from '../testHarness/scheduling/schedulingReport';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import {
  SCHEDULING_REPORT_PROPERTIES,
  SCHEDULE_RERUN_STABLE,
  SCHEDULE_REPORT_TRUE,
  SCHEDULE_ACCOUNTED,
  checkSchedulingReport,
  checkRerunStable,
} from '../testHarness/scheduling/schedulingReportProperties';

// constants and types
import { MAIN } from '@Constants/drawDefinitionConstants';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const venueId = 'venue1';
const day1 = '2026-10-01';
const day2 = '2026-10-02';

/** a 32 draw profiled over two days; the final is held back on day 2 by the daily limit */
function profileRun() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles: [{ drawSize: 32 }],
    startDate: day1,
    endDate: day2,
    setState: true,
  });
  const { tournamentId, events } = tournamentEngine.getTournament().tournamentRecord;
  const { eventId, drawDefinitions } = events[0];
  const { drawId, structures } = drawDefinitions[0];
  for (const [scheduleDate, roundNumbers] of [
    [day1, [1, 2]],
    [day2, [3, 4, 5]],
  ] as const)
    for (const roundNumber of roundNumbers)
      tournamentEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber },
        scheduleDate,
        venueId,
      });
  const before = tournamentEngine.getTournament().tournamentRecord;
  const params = { scheduleDates: [day1, day2] };
  const result: any = tournamentEngine.scheduleProfileRounds(params);
  expect(result.success).toEqual(true);
  const after = tournamentEngine.getTournament().tournamentRecord;
  const final = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [5] } }).matchUps[0];
  return { before, after, params, report: schedulingReport('scheduleProfileRounds', result) as any, final };
}

const properties = (violations: any[]) =>
  [...new Set(violations.map((v) => v.property))].sort((a, b) => a.localeCompare(b));

it('every scheduling report property is in the schema enum and defined in INVARIANTS.md', () => {
  const schema = JSON.parse(fs.readFileSync('corpus/corpus.schema.json', 'utf8'));
  const invariantsDoc = fs.readFileSync('corpus/INVARIANTS.md', 'utf8');
  for (const name of SCHEDULING_REPORT_PROPERTIES) {
    expect(schema.definitions.PropertyName.enum).toContain(name);
    expect(invariantsDoc).toContain(`### \`${name}\``);
  }
});

describe('scheduling report properties: quiet on a true report, and each fires on its own fault', () => {
  it('a true report is not charged', () => {
    const { before, after, params, report } = profileRun();
    expect(checkSchedulingReport({ before, after, params, report })).toEqual([]);
  });

  it('SCHEDULE_ACCOUNTED: an untimed profiled matchUp with no reason', () => {
    const { before, after, params, report, final } = profileRun();
    // drop the final from every reason it was reported under
    const doctored = structuredClone(report);
    for (const key of Object.keys(doctored))
      for (const date of Object.keys(doctored[key] ?? {}))
        if (Array.isArray(doctored[key][date]))
          doctored[key][date] = doctored[key][date].filter((id: string) => id !== final.matchUpId);
    const violations = checkSchedulingReport({ before, after, params, report: doctored });
    expect(properties(violations)).toEqual([SCHEDULE_ACCOUNTED]);
    expect(violations.map((v) => v.matchUpId)).toEqual([final.matchUpId]);
  });

  it('SCHEDULE_REPORT_TRUE: a placed matchUp missing from the report, and an unplaced one in it', () => {
    const { before, after, params, report, final } = profileRun();
    const [placed] = report.scheduledMatchUpIds[day1];
    const missing = structuredClone(report);
    missing.scheduledMatchUpIds[day1] = missing.scheduledMatchUpIds[day1].filter((id: string) => id !== placed);
    expect(checkSchedulingReport({ before, after, params, report: missing }).map((v) => v.matchUpId)).toEqual([placed]);

    const claimed = structuredClone(report);
    claimed.scheduledMatchUpIds[day2] = [...claimed.scheduledMatchUpIds[day2], final.matchUpId];
    const violations = checkSchedulingReport({ before, after, params, report: claimed });
    expect(properties(violations)).toEqual([SCHEDULE_REPORT_TRUE]);
  });

  it('a dry run is not asked: it reports placements and writes nothing, by design', () => {
    const { before, params, report } = profileRun();
    expect(checkSchedulingReport({ before, after: before, params: { ...params, dryRun: true }, report })).toEqual([]);
  });

  it('SCHEDULE_RERUN_STABLE: the same call again places nothing; a step that placed is charged', () => {
    const { after, params, before } = profileRun();
    const result: any = tournamentEngine.scheduleProfileRounds(params);
    expect(result.success).toEqual(true);
    const again = tournamentEngine.getTournament().tournamentRecord;
    expect(checkRerunStable({ before: after, after: again })).toEqual([]);
    expect(properties(checkRerunStable({ before, after }))).toEqual([SCHEDULE_RERUN_STABLE]);
  });
});

describe('C4: scheduleProfileGrid reports as scheduled only what it wrote', () => {
  it('a completed matchUp is never placed, whatever scheduleCompletedMatchUps says; what is reported is stored', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId }],
      drawProfiles: [
        {
          drawSize: 8,
          outcomes: [1, 2, 3, 4].map((roundPosition) => ({
            roundNumber: 1,
            roundPosition,
            scoreString: '6-0 6-0',
            winningSide: 1,
          })),
        },
      ],
      startDate: day1,
      endDate: day2,
      setState: true,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const { tournamentId, eventId, drawId, structureId } = matchUps[0];
    const locked = matchUps.find((m: any) => m.stage === MAIN && m.roundNumber === 2 && m.roundPosition === 1);
    // a lock pins a placement, so the locked matchUp is given one first: row 9 of day 1, which the grid would move it from
    const { courtId } = tournamentEngine.getVenuesAndCourts().courts[0];
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: day1, courtId, courtOrder: 9 },
      matchUpId: locked.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpScheduleLock({ matchUpId: locked.matchUpId, drawId, lock: {} });
    expect(result.success).toEqual(true);
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: day1,
          venues: [
            {
              venueId,
              rounds: [1, 2].map((roundNumber) => ({ tournamentId, eventId, drawId, structureId, roundNumber })),
            },
          ],
        },
      ],
    });
    result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [day1], scheduleCompletedMatchUps: true });
    expect(result.success).toEqual(true);
    const stored = new Map(
      tournamentEngine.allTournamentMatchUps().matchUps.map((m: any) => [m.matchUpId, m.schedule?.scheduledDate]),
    );
    const reported = result.scheduledMatchUpIds[day1] ?? [];
    // was (C4): the four completed R1 matchUps reported scheduled and never written; then, with the flag honoured,
    // written. Since CA 2026-10-23 the profile schedulers never place a completed matchUp: only R2's unlocked matchUp
    expect(reported.length).toEqual(1);
    const completed = tournamentEngine.allTournamentMatchUps().matchUps.filter((m: any) => m.roundNumber === 1);
    expect(completed.every((m: any) => !reported.includes(m.matchUpId) && !m.schedule?.scheduledDate)).toEqual(true);
    expect(reported.every((id: string) => stored.get(id) === day1)).toEqual(true);
    // the grid leaves a matchUp that already holds a court placement where it is, lock or no lock
    expect(reported).not.toContain(locked.matchUpId);
  });

  it('proAutoSchedule: a matchUp the write skips is reported not scheduled', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4, venueId }],
      drawProfiles: [
        { drawSize: 4, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString: '6-0 6-0', winningSide: 1 }] },
      ],
      startDate: day1,
      endDate: day1,
      setState: true,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true }).matchUps;
    const completed = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
    const result: any = tournamentEngine.proAutoSchedule({ scheduledDate: day1, matchUps });
    expect(result.success).toEqual(true);
    const stored = tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((m: any) => m.matchUpId === completed.matchUpId);
    expect(stored.schedule?.scheduledDate).toBeUndefined();
    // was: reported scheduled, though the write skipped it as completed
    expect(result.scheduled.map((m: any) => m.matchUpId)).not.toContain(completed.matchUpId);
    expect(result.notScheduled.map((m: any) => m.matchUpId)).toContain(completed.matchUpId);
  });

  it('C5: a date the grid skips (no court in the filter) reports its matchUps as not scheduled', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 2, venueId }],
      drawProfiles: [{ drawSize: 8 }],
      startDate: day1,
      endDate: day1,
      setState: true,
    });
    const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    const { tournamentId, eventId, drawId, structureId } = r1[0];
    tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        {
          scheduleDate: day1,
          venues: [{ venueId, rounds: [{ tournamentId, eventId, drawId, structureId, roundNumber: 1 }] }],
        },
      ],
    });
    const result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [day1], courtIds: [] });
    expect(result.success).toEqual(true);
    // was: success, nothing scheduled and nothing reported
    expect([...(result.notScheduledMatchUpIds[day1] ?? [])].sort((a, b) => a.localeCompare(b))).toEqual(
      r1.map((m: any) => m.matchUpId).sort((a, b) => a.localeCompare(b)),
    );
  });
});
