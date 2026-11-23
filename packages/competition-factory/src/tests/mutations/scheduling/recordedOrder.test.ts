import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { END_TIME } from '@Constants/timeItemConstants';

// The recorded times of linked matchUps may not conflict (CA 2026-10-30): a source must have ended by the time its
// dependent started, and must have started first. Only recorded start and end times are compared; an end that falls
// after a dependent's SCHEDULED time is fine.

const day1 = '2026-10-01';
const day2 = '2026-10-02';

/** a 4 draw: semifinal 1 and the final, both placed on day 1 in order */
function linkedPair({ semifinalOutcome }: { semifinalOutcome?: any } = {}) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, outcomes: semifinalOutcome ? [semifinalOutcome] : [] }],
    startDate: day1,
    endDate: day2,
    setState: true,
  });
  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const semifinal = matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
  const final = matchUps.find((m: any) => m.roundNumber === 2);
  const write = (matchUp: any, schedule: any) =>
    tournamentEngine.addMatchUpScheduleItems({
      scheduleCompletedMatchUps: true,
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      schedule,
    });
  expect(write(semifinal, { scheduledDate: day1, scheduledTime: '10:00' }).success).toEqual(true);
  expect(write(final, { scheduledDate: day1, scheduledTime: '13:00' }).success).toEqual(true);
  return { semifinal, final, write };
}

describe('recorded start and end times of linked matchUps', () => {
  it('a dependent may not start before its source ended; it may start the minute it ended', () => {
    const { semifinal, final, write } = linkedPair();
    expect(write(semifinal, { startTime: '10:00', endTime: '11:30' }).success).toEqual(true);

    let result: any = write(final, { startTime: '11:00' });
    expect(result.error).toEqual(ANACHRONISM);
    expect(result.context.blockingMatchUps).toEqual([
      expect.objectContaining({ matchUpId: semifinal.matchUpId, relation: 'source', endTime: '11:30' }),
    ]);

    result = write(final, { startTime: '11:30' });
    expect(result.success).toEqual(true);
  });

  it('a source may not end after its dependent started, nor start after it', () => {
    const { semifinal, final, write } = linkedPair();
    expect(write(final, { startTime: '12:00' }).success).toEqual(true);

    let result: any = write(semifinal, { startTime: '10:00', endTime: '12:30' });
    expect(result.error).toEqual(ANACHRONISM);
    expect(result.context.blockingMatchUps.map((m: any) => m.relation)).toEqual(['dependent']);

    result = write(semifinal, { startTime: '12:15' });
    expect(result.error).toEqual(ANACHRONISM);

    expect(write(semifinal, { startTime: '10:00', endTime: '11:45' }).success).toEqual(true);
  });

  it('an end after the dependent’s SCHEDULED time is fine', () => {
    const { semifinal, write } = linkedPair();
    // the final is scheduled at 13:00 and has recorded nothing
    expect(write(semifinal, { startTime: '11:00', endTime: '13:30' }).success).toEqual(true);
  });

  it('a source that ran past midnight ends on the next day', () => {
    const { semifinal, final, write } = linkedPair();
    expect(write(final, { scheduledDate: day2, scheduledTime: '10:00' }).success).toEqual(true);
    expect(write(semifinal, { startTime: '23:00', endTime: '00:30' }).success).toEqual(true);

    const result: any = write(final, { startTime: '00:15' });
    expect(result.error).toEqual(ANACHRONISM);
    expect(write(final, { startTime: '00:45' }).success).toEqual(true);
  });

  it('a completed source keeps its times editable, and the conflict is refused on the bulk write too', () => {
    const { semifinal, final, write } = linkedPair({
      semifinalOutcome: { roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 },
    });
    expect(write(final, { startTime: '12:00' }).success).toEqual(true);

    let result: any = tournamentEngine.bulkScheduleMatchUps({
      schedule: { endTime: '12:30' },
      matchUpIds: [semifinal.matchUpId],
      scheduleCompletedMatchUps: true,
      removePriorValues: true,
    });
    expect(result.error).toEqual(ANACHRONISM);

    result = tournamentEngine.bulkScheduleMatchUps({
      schedule: { startTime: '10:00', endTime: '11:30' },
      matchUpIds: [semifinal.matchUpId],
      scheduleCompletedMatchUps: true,
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);
    expect(result.scheduled).toEqual(1);
  });

  it('an end time given with an outcome is judged before the outcome lands: refused whole', () => {
    const { semifinal, final, write } = linkedPair();
    expect(write(final, { startTime: '12:00' }).success).toEqual(true);

    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    let result: any = tournamentEngine.setMatchUpStatus({
      schedule: { startTime: '10:00', endTime: '12:30' },
      matchUpId: semifinal.matchUpId,
      drawId: semifinal.drawId,
      outcome,
    });
    expect(result.error).toEqual(ANACHRONISM);
    const stored = tournamentEngine.findMatchUp({ matchUpId: semifinal.matchUpId, drawId: semifinal.drawId }).matchUp;
    expect(stored.winningSide).toBeUndefined();
    expect(stored.schedule?.endTime).toBeUndefined();

    result = tournamentEngine.setMatchUpStatus({
      schedule: { startTime: '10:00', endTime: '11:30' },
      matchUpId: semifinal.matchUpId,
      drawId: semifinal.drawId,
      outcome,
    });
    expect(result.success).toEqual(true);
  });

  it('a start and an end written together are judged together', () => {
    const { semifinal, final, write } = linkedPair();
    // an end past midnight, given with its start in one write, falls on the next day
    expect(write(final, { scheduledDate: day2, scheduledTime: '10:00' }).success).toEqual(true);
    expect(write(final, { startTime: '00:20' }).success).toEqual(true);
    const result: any = write(semifinal, { startTime: '23:00', endTime: '00:30' });
    expect(result.error).toEqual(ANACHRONISM);
    expect(write(semifinal, { startTime: '22:30', endTime: '00:15' }).success).toEqual(true);
  });

  it('writing back a conflict an older engine stored is never refused', () => {
    const { semifinal, final, write } = linkedPair();
    expect(write(final, { startTime: '12:00' }).success).toEqual(true);

    const record = tournamentEngine.getTournament().tournamentRecord;
    const raw = record.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === semifinal.matchUpId,
    );
    raw.timeItems = [...(raw.timeItems ?? []), { itemType: END_TIME, itemValue: '12:30' }];
    tournamentEngine.setState(record);

    expect(write(semifinal, { endTime: '12:30' }).success).toEqual(true);
    expect(write(semifinal, { endTime: '12:45' }).error).toEqual(ANACHRONISM);
  });

  it('a matchUp with no scheduled date has no instants, and proves nothing', () => {
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }], startDate: day1, setState: true });
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const semifinal = matchUps.find((m: any) => m.roundNumber === 1);
    const final = matchUps.find((m: any) => m.roundNumber === 2);
    const write = (matchUp: any, schedule: any) =>
      tournamentEngine.addMatchUpScheduleItems({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, schedule });
    expect(write(semifinal, { startTime: '10:00', endTime: '11:30' }).success).toEqual(true);
    expect(write(final, { startTime: '09:00' }).success).toEqual(true);
  });
});
