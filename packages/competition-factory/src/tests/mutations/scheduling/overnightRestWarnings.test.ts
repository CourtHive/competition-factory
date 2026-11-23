import { getOvernightRestWarnings } from '@Query/matchUps/scheduling/getOvernightRestWarnings';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

const DAYS = ['2026-03-02', '2026-03-03'];
const VENUE = 'venue-1';

function tournament(category?: { categoryType?: string; ageCategoryCode?: string }) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount: 1, startTime: '08:00', endTime: '23:00' }],
    drawProfiles: [{ drawSize: 4, ...(category && { category }) }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
}

function roundMatchUps(roundNumber: number) {
  return tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [roundNumber] } }).matchUps;
}

/** both semifinals at 21:00 on the first date (90 minutes: play ends 22:30), the final profiled on the next */
function lateSemifinals(schedule: Record<string, string> = {}) {
  for (const matchUp of roundMatchUps(1)) {
    const result = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAYS[0], scheduledTime: '21:00', venueId: VENUE, ...schedule },
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
    });
    expect(result.success).toEqual(true);
  }
  const { tournamentRecord } = tournamentEngine.getTournament();
  const [event] = tournamentRecord.events;
  const [drawDefinition] = event.drawDefinitions;
  const result = tournamentEngine.addSchedulingProfileRound({
    round: {
      structureId: drawDefinition.structures[0].structureId,
      tournamentId: tournamentRecord.tournamentId,
      drawId: drawDefinition.drawId,
      eventId: event.eventId,
      roundNumber: 2,
    },
    scheduleDate: DAYS[1],
    venueId: VENUE,
  });
  expect(result.success).toEqual(true);
}

const finalTime = () => roundMatchUps(2)[0].schedule?.scheduledTime;

describe('overnight rest is warned, not held (§ 9.8)', () => {
  it('places a junior final at the first slot and warns each of its players', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals();
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
    expect(result.success).toEqual(true);
    expect(finalTime()).toEqual('08:00');

    const warnings = result.overnightRestWarnings[DAYS[1]];
    expect(warnings).toHaveLength(2);
    // the semifinals are undecided: the warning is for whoever advances from each
    const [final] = roundMatchUps(2);
    const semifinalIds = roundMatchUps(1).map(({ matchUpId }) => matchUpId);
    expect(warnings.map(({ previousMatchUpId }) => previousMatchUpId).sort()).toEqual(semifinalIds.sort());
    for (const warning of warnings) {
      expect(warning.participantId).toBeUndefined();
      expect(warning).toMatchObject({
        matchUpId: final.matchUpId,
        previousEndTime: '22:30',
        requiredMinutes: 720,
        scheduleTime: '08:00',
        restMinutes: 570,
      });
    }
    // the date before has no matchUps the day before it
    expect(result.overnightRestWarnings[DAYS[0]]).toBeUndefined();
  });

  it('a decided matchUp warns for its winner, by name, in the matchUp of the date', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals({ endTime: '22:00' });
    const winners: string[] = [];
    for (const matchUp of roundMatchUps(1)) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
      const result = tournamentEngine.setMatchUpStatus({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        outcome,
      });
      expect(result.success).toEqual(true);
      winners.push(matchUp.sides[0].participantId);
    }
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
    const warnings = result.overnightRestWarnings[DAYS[1]];
    expect(warnings.map(({ participantId }) => participantId).sort()).toEqual(winners.sort());
    expect(warnings.map(({ restMinutes }) => restMinutes)).toEqual([600, 600]);
  });

  it('a dry run reports the warnings of the placements it previews', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals();
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]], dryRun: true });
    expect(finalTime()).toBeUndefined();
    expect(result.overnightRestWarnings[DAYS[1]]).toHaveLength(2);
  });

  it('measures from a recorded endTime: the actual completion', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals({ scheduledTime: '18:00', endTime: '20:30' }); // an estimate would end at 19:30
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
    expect(result.overnightRestWarnings[DAYS[1]].map((w) => [w.previousEndTime, w.restMinutes])).toEqual([
      ['20:30', 690],
      ['20:30', 690],
    ]);
  });

  it('an endTime before its start finished after midnight', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals({ scheduledTime: '22:30', endTime: '00:30' });
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
    const [warning] = result.overnightRestWarnings[DAYS[1]];
    expect(warning).toMatchObject({ previousEndTime: '00:30', restMinutes: 450 });
  });

  it('twelve hours of rest is no warning', () => {
    tournament({ ageCategoryCode: 'U14' });
    lateSemifinals({ scheduledTime: '18:00', endTime: '20:00' });
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
    expect(finalTime()).toEqual('08:00');
    expect(result.overnightRestWarnings).toEqual({});
  });

  it('a stated categoryType wins over the age code; adult and open play are not warned', () => {
    for (const category of [{ categoryType: 'ADULT', ageCategoryCode: 'U14' }, { ageCategoryCode: 'O35' }, undefined]) {
      tournament(category);
      lateSemifinals();
      let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[1]] });
      expect(finalTime()).toEqual('08:00');
      expect(result.overnightRestWarnings).toEqual({});
    }
  });

  it('a stated JUNIOR is warned without an age code', () => {
    tournament({ categoryType: 'JUNIOR' });
    lateSemifinals();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const warnings = getOvernightRestWarnings({
      tournamentRecords: { [tournamentRecord.tournamentId]: tournamentRecord },
      scheduleOverrides: { [roundMatchUps(2)[0].matchUpId]: { scheduledDate: DAYS[1], scheduledTime: '09:00' } },
      scheduleDates: [DAYS[1]],
    });
    expect(warnings[DAYS[1]].map(({ restMinutes }) => restMinutes)).toEqual([630, 630]);
  });
});

describe('every scheduler reports overnight rest', () => {
  const finalId = () => roundMatchUps(2)[0].matchUpId;
  const warnedFinal = (warnings) => warnings?.[DAYS[1]]?.map(({ matchUpId }) => matchUpId);

  it('scheduleMatchUps, placed and in a dry run', () => {
    for (const dryRun of [true, false]) {
      tournament({ ageCategoryCode: 'U14' });
      lateSemifinals();
      let result: any = tournamentEngine.scheduleMatchUps({
        matchUpIds: [finalId()],
        scheduleDate: DAYS[1],
        venueIds: [VENUE],
        dryRun,
      });
      expect(result.success).toEqual(true);
      expect(result.scheduledMatchUpIds).toEqual([finalId()]);
      expect(finalTime()).toEqual(dryRun ? undefined : '08:00');
      expect(warnedFinal(result.overnightRestWarnings)).toEqual([finalId(), finalId()]);
    }
  });

  it('the grid and the pro scheduler, for a placement with a time; a court order alone has none', () => {
    for (const timed of [true, false]) {
      tournament({ ageCategoryCode: 'U14' });
      lateSemifinals();
      if (timed) {
        const result = tournamentEngine.addMatchUpScheduleItems({
          schedule: { scheduledDate: DAYS[1], scheduledTime: '08:00' },
          drawId: roundMatchUps(2)[0].drawId,
          matchUpId: finalId(),
        });
        expect(result.success).toEqual(true);
      }
      let result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [DAYS[1]] });
      expect(result.scheduledMatchUpIds[DAYS[1]]).toEqual([finalId()]);
      expect(warnedFinal(result.overnightRestWarnings)).toEqual(timed ? [finalId(), finalId()] : undefined);

      const { courts } = tournamentEngine.getVenuesAndCourts();
      result = tournamentEngine.proAutoSchedule({
        matchUps: tournamentEngine.allTournamentMatchUps({
          matchUpFilters: { matchUpIds: [finalId()] },
          nextMatchUps: true,
          inContext: true,
        }).matchUps,
        courtIds: courts.map(({ courtId }) => courtId),
        scheduledDate: DAYS[1],
      });
      expect(result.success).toEqual(true);
      expect(warnedFinal(result.overnightRestWarnings)).toEqual(timed ? [finalId(), finalId()] : undefined);
    }
  });
});

describe('timingCategoryType', () => {
  it.each([
    [undefined, undefined],
    [{}, undefined],
    [{ categoryType: 'ADULT', ageCategoryCode: 'U14' }, 'ADULT'],
    [{ subType: 'ADULT', ageCategoryCode: 'U14' }, 'ADULT'],
    [{ ageCategoryCode: 'U14' }, 'JUNIOR'],
    [{ ageCategoryCode: '16U' }, 'JUNIOR'],
    [{ ageCategoryCode: 'u18' }, 'JUNIOR'],
    [{ ageCategoryCode: 'U21' }, undefined],
    [{ ageCategoryCode: 'O35' }, undefined],
    [{ ageCategoryCode: 'OPEN' }, undefined],
    [{ ageCategoryCode: '18U-O14' }, undefined],
  ])('%j → %s', (category: any, expected) => {
    expect(timingCategoryType(category)).toEqual(expected);
  });
});
