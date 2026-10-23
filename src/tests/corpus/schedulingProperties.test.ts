import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import {
  SCHEDULE_DAILY_LIMITS_RESPECTED,
  SCHEDULE_RECOVERY_RESPECTED,
  SCHEDULE_NO_BYE_PLACED,
  SCHEDULING_STEP_PROPERTIES,
  SCHEDULE_SOURCES_FIRST,
  checkSchedulingStep,
  placedMatchUpIds,
} from '../testHarness/scheduling/schedulingProperties';

// constants and types
import { MAIN } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const venueId = 'venue1';
const day1 = '2026-10-01';
const day2 = '2026-10-02';

function setup(drawProfile: any = { drawSize: 16 }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles: [drawProfile],
    startDate: day1,
    endDate: day2,
  });
  tournamentEngine.setState(tournamentRecord);
  const record = () => tournamentEngine.getTournament().tournamentRecord;
  const at = (roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) => m.stage === MAIN && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const place = (matchUp: any, scheduledDate: string, scheduledTime: string) => {
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate, scheduledTime },
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
    });
    expect(result.success).toEqual(true);
  };
  return { record, at, place };
}

// a name is defined in three places, and a scenario cannot claim one the schema does not list
it('every scheduling step property is in the schema enum and defined in INVARIANTS.md', () => {
  const schema = JSON.parse(fs.readFileSync('corpus/corpus.schema.json', 'utf8'));
  const invariantsDoc = fs.readFileSync('corpus/INVARIANTS.md', 'utf8');
  for (const name of SCHEDULING_STEP_PROPERTIES) {
    expect(schema.definitions.PropertyName.enum).toContain(name);
    expect(invariantsDoc).toContain(`### \`${name}\``);
  }
});

const properties = (violations: any[]) =>
  [...new Set(violations.map((v) => v.property))].sort((a, b) => a.localeCompare(b));

// a detector is trusted once it has been seen to fire: each fault below is placed by hand, outside any scheduler
describe('scheduling step properties: each one fires on its own fault', () => {
  it('a step that times nothing is never charged', () => {
    const { record } = setup();
    expect(checkSchedulingStep({ before: record(), after: record() })).toEqual([]);
  });

  it('SCHEDULE_NO_BYE_PLACED', () => {
    const { record, at, place } = setup({ drawSize: 16, participantsCount: 14 });
    const bye = tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpStatus === BYE);
    expect(bye).toBeDefined();
    const before = record();
    place(bye, day1, '08:00');
    const violations = checkSchedulingStep({ before, after: record() });
    expect(properties(violations)).toEqual([SCHEDULE_NO_BYE_PLACED]);
    expect(at(1, 1)).toBeDefined();
  });

  it('SCHEDULE_SOURCES_FIRST, a dependent placed before its source is free', () => {
    const { record, at, place } = setup();
    place(at(1, 1), day1, '10:00');
    const before = record();
    // R1 at 10:00 runs 90 minutes plus 60 of recovery: R2 at 11:00 is early, and so is anything on the day before
    place(at(2, 1), day1, '11:00');
    expect(properties(checkSchedulingStep({ before, after: record() }))).toContain(SCHEDULE_SOURCES_FIRST);
  });

  it('SCHEDULE_SOURCES_FIRST, through more than one round', () => {
    const { record, at, place } = setup();
    place(at(1, 1), day2, '08:00');
    const before = record();
    place(at(3, 1), day1, '18:00');
    const violations = checkSchedulingStep({ before, after: record() });
    expect(violations.filter((v) => v.property === SCHEDULE_SOURCES_FIRST)).toHaveLength(1);
  });

  it('SCHEDULE_SOURCES_FIRST, a source placed after its already-timed dependent', () => {
    const { record, at, place } = setup();
    place(at(2, 1), day1, '09:00');
    const before = record();
    place(at(1, 2), day1, '08:30');
    expect(properties(checkSchedulingStep({ before, after: record() }))).toContain(SCHEDULE_SOURCES_FIRST);
  });

  it('SCHEDULE_SOURCES_FIRST is quiet when the dependent starts once the source is free', () => {
    const { record, at, place } = setup();
    place(at(1, 1), day1, '08:00');
    place(at(1, 2), day1, '08:00');
    const before = record();
    place(at(2, 1), day1, '10:30');
    expect(checkSchedulingStep({ before, after: record() })).toEqual([]);
  });

  it('SCHEDULE_RECOVERY_RESPECTED, across draws', () => {
    // two draws over the same participants: one person's two R1 matchUps, 30 minutes apart
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }],
      participantsProfile: { participantsCount: 8 },
      startDate: day1,
      endDate: day2,
    });
    tournamentEngine.setState(tournamentRecord);
    const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    const [first] = matchUps;
    const personId = first.sides[0].participantId;
    const second = matchUps.find(
      (m: any) => m.drawId !== first.drawId && m.sides.some((side: any) => side.participantId === personId),
    );
    expect(second).toBeDefined();
    const schedule = (m: any, scheduledTime: string) =>
      tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: day1, scheduledTime },
        matchUpId: m.matchUpId,
        drawId: m.drawId,
      });
    schedule(first, '08:00');
    const before = tournamentEngine.getTournament().tournamentRecord;
    schedule(second, '08:30');
    const after = tournamentEngine.getTournament().tournamentRecord;
    expect(placedMatchUpIds(before, after)).toEqual([second.matchUpId]);
    expect(properties(checkSchedulingStep({ before, after }))).toEqual([SCHEDULE_RECOVERY_RESPECTED]);
  });

  it('SCHEDULE_DAILY_LIMITS_RESPECTED, and only for what the step added', () => {
    const { record, at, place } = setup();
    let result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1, total: 1 } });
    expect(result.success).toEqual(true);
    place(at(1, 1), day1, '08:00');
    const before = record();
    // R2 at 14:00 leaves room to recover but is a second singles for R1's winner... who is not certain yet: no fault
    place(at(2, 1), day1, '14:00');
    expect(checkSchedulingStep({ before, after: record() })).toEqual([]);

    // with R1 decided, the winner is certain in R2 and the day holds two singles for them
    const winner = tournamentEngine.setMatchUpStatus({
      matchUpId: at(1, 1).matchUpId,
      drawId: at(1, 1).drawId,
      outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome,
    });
    expect(winner.success).toEqual(true);
    tournamentEngine.clearMatchUpSchedule({ matchUpId: at(2, 1).matchUpId, drawId: at(2, 1).drawId });
    const cleared = record();
    place(at(2, 1), day1, '14:00');
    expect(properties(checkSchedulingStep({ before: cleared, after: record() }))).toEqual([
      SCHEDULE_DAILY_LIMITS_RESPECTED,
    ]);

    // a participant already over before the step is not charged to a step that does not add to it
    const over = record();
    place(at(1, 2), day1, '08:00');
    expect(checkSchedulingStep({ before: over, after: record() })).toEqual([]);
  });

  it('SCHEDULE_DAILY_LIMITS_RESPECTED counts a court-grid placement (a date and a court order, no time)', () => {
    const { record, at, place } = setup();
    let result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1, total: 1 } });
    expect(result.success).toEqual(true);
    const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    place(at(1, 1), day1, '08:00');
    result = tournamentEngine.setMatchUpStatus({ matchUpId: at(1, 1).matchUpId, drawId: at(1, 1).drawId, outcome });
    expect(result.success).toEqual(true);
    const before = record();
    // R1's winner, certain in R2, gets a second singles on day 1 from the grid: a court order and no time
    result = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: day1, courtOrder: 1 },
      matchUpId: at(2, 1).matchUpId,
      drawId: at(2, 1).drawId,
    });
    expect(result.success).toEqual(true);
    expect(properties(checkSchedulingStep({ before, after: record() }))).toEqual([SCHEDULE_DAILY_LIMITS_RESPECTED]);
    // a call that waived the limits ({}) is not charged
    expect(checkSchedulingStep({ before, after: record(), dailyLimitsWaived: true })).toEqual([]);
  });
});

describe('scheduling step properties hold on a profile run', () => {
  it('scheduleProfileRounds over two days creates no fault, and holds the final back at the daily limit', () => {
    const { record } = setup({ drawSize: 32 });
    const { tournamentId, events } = record();
    const { eventId, drawDefinitions } = events[0];
    const { drawId, structures } = drawDefinitions[0];
    const { structureId } = structures[0];
    for (const [scheduleDate, roundNumbers] of [
      [day1, [1, 2]],
      [day2, [3, 4, 5]],
    ] as const)
      for (const roundNumber of roundNumbers) {
        let result: any = tournamentEngine.addSchedulingProfileRound({
          round: { tournamentId, eventId, drawId, structureId, roundNumber },
          scheduleDate,
          venueId,
        });
        expect(result.success).toEqual(true);
      }
    const before = record();
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [day1, day2] });
    expect(result.success).toEqual(true);
    const after = record();
    // R3, R4 and the final on one day would be three singles for a finalist; the default limit is two
    const final = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [5] } }).matchUps[0];
    expect(result.overLimitMatchUpIds[day2]).toEqual([final.matchUpId]);
    expect(placedMatchUpIds(before, after).length).toEqual(30);
    expect(checkSchedulingStep({ before, after })).toEqual([]);
  });
});
