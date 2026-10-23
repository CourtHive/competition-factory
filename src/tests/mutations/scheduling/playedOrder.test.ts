import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and types
import { IN_PROGRESS, WALKOVER } from '@Constants/matchUpStatusConstants';
import { ANACHRONISM } from '@Constants/errorConditionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

// The played-order rule (CA 2026-10-22, SCHEDULING_PIPELINE_VNEXT.md § 5 "C2 ordering rule"): a matchUp may not be
// placed at or before a PLAYED matchUp it depends on (COMPLETED, RETIRED or DEFAULTED, with a score), nor a played
// matchUp after one that depends on it. Scheduled against scheduled only; asked only of a write that moves a matchUp.

const day1 = '2026-10-01';
const day2 = '2026-10-02';
const venueId = 'venue1';

/** the matchUp at a round and position, as the engine holds it now */
const matchUpAt = (roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

/** an 8 draw: R1 played, semifinal 1 played (unless `semifinalOutcome` is null) and timed day 2 at 10:00 */
function playedSemifinal({ semifinalOutcome = { scoreString: '6-1 6-1', winningSide: 1 } }: any = {}) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        outcomes: [
          ...[1, 2, 3, 4].map((roundPosition) => ({
            roundNumber: 1,
            roundPosition,
            scoreString: '6-1 6-1',
            winningSide: 1,
          })),
          ...(semifinalOutcome ? [{ roundNumber: 2, roundPosition: 1, ...semifinalOutcome }] : []),
        ],
      },
    ],
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 4, venueId }],
    startDate: day1,
    endDate: day2,
    setState: true,
  });
  const at = matchUpAt;
  const write = (matchUp: any, schedule: any, extra: any = {}) =>
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      schedule,
      ...extra,
    });

  const semifinal = at(2, 1);
  // stamped before the outcome would matter: the source's own placement is never refused while nothing it feeds is timed
  expect(write(semifinal, { scheduledDate: day2, scheduledTime: '10:00' }).success).toEqual(true);
  return { at, write, semifinal, final: at(3, 1) };
}

const timeOf = (matchUp: any) => extractTime(matchUp.schedule?.scheduledTime);

describe('a matchUp is never placed at or before a played matchUp it depends on', () => {
  it('refuses at or before the played source on its date, and on an earlier date; writes nothing', () => {
    const { at, write, final } = playedSemifinal();
    for (const schedule of [
      { scheduledDate: day2, scheduledTime: '09:00' },
      { scheduledDate: day2, scheduledTime: '10:00' },
      { scheduledDate: day1, scheduledTime: '18:00' },
      { scheduledDate: day1 },
    ]) {
      const result: any = write(final, schedule);
      expect(result.error).toEqual(ANACHRONISM);
      expect(result.context.blockingMatchUps.map((m: any) => m.relation)).toEqual(['playedSource']);
      expect(at(3, 1).schedule?.scheduledDate).toBeUndefined();
    }
    expect(write(final, { scheduledDate: day2, scheduledTime: '12:00' }).success).toEqual(true);
  });

  it('a same-day placement without a time proves nothing, and is accepted', () => {
    const { write, final } = playedSemifinal();
    expect(write(final, { scheduledDate: day2 }).success).toEqual(true);
  });

  it('checkChronology: false does not waive it, and the standalone time and date writers refuse too', () => {
    const { write, final } = playedSemifinal();
    let result: any = write(final, { scheduledDate: day2, scheduledTime: '09:00' }, { checkChronology: false });
    expect(result.error).toEqual(ANACHRONISM);
    expect(write(final, { scheduledDate: day2 }).success).toEqual(true);
    result = tournamentEngine.addMatchUpScheduledTime({
      matchUpId: final.matchUpId,
      drawId: final.drawId,
      scheduledTime: '09:00',
    });
    expect(result.error).toEqual(ANACHRONISM);
    result = tournamentEngine.addMatchUpScheduledDate({
      matchUpId: final.matchUpId,
      drawId: final.drawId,
      scheduledDate: day1,
    });
    expect(result.error).toEqual(ANACHRONISM);
  });

  it('both directions: a played matchUp is not moved after a matchUp that depends on it', () => {
    const { write, semifinal, final } = playedSemifinal();
    expect(write(final, { scheduledDate: day2, scheduledTime: '12:00' }).success).toEqual(true);
    const result: any = write(semifinal, { scheduledDate: day2, scheduledTime: '13:00' });
    expect(result.error).toEqual(ANACHRONISM);
    expect(result.context.blockingMatchUps.map((m: any) => m.relation)).toEqual(['dependent']);
    expect(write(semifinal, { scheduledDate: day2, scheduledTime: '09:00' }).success).toEqual(true);
  });

  it('a write that does not move the matchUp is never refused, though the stored order is already wrong', () => {
    const { write, final } = playedSemifinal();
    // an order an older engine accepted: write it raw, as an import would
    const record = tournamentEngine.getTournament().tournamentRecord;
    const rawFinal = record.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (m: any) => m.matchUpId === final.matchUpId,
    );
    rawFinal.schedule = { ...rawFinal.schedule, scheduledDate: day2, scheduledTime: '09:00' };
    tournamentEngine.setState(record);
    expect(write(final, { courtOrder: 1 }).success).toEqual(true);
    expect(write(final, { scheduledDate: day2, scheduledTime: '09:00' }).success).toEqual(true);
  });
});

describe('what is not played imposes nothing', () => {
  it('a walkover source', () => {
    const { at, write, final } = playedSemifinal({ semifinalOutcome: { matchUpStatus: WALKOVER, winningSide: 1 } });
    expect(at(2, 1).matchUpStatus).toEqual(WALKOVER);
    expect(write(final, { scheduledDate: day2, scheduledTime: '09:00' }).success).toEqual(true);
  });

  it('a source IN_PROGRESS with a score (CA: not played)', () => {
    // the mocks generator does not take an IN_PROGRESS outcome, so semifinal 1 is set in progress here
    const { at, write, final } = playedSemifinal({ semifinalOutcome: null });
    const semifinal = at(2, 1);
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1', matchUpStatus: IN_PROGRESS });
    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: semifinal.matchUpId,
      drawId: semifinal.drawId,
      outcome,
    });
    expect(result.success).toEqual(true);
    expect(at(2, 1).matchUpStatus).toEqual(IN_PROGRESS);
    expect(at(2, 1).score?.scoreStringSide1).toBeDefined();
    result = write(final, { scheduledDate: day2, scheduledTime: '09:00' });
    expect(result.success).toEqual(true);
  });

  it('AD_HOC rounds carry no links, and so no order', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: AD_HOC, drawSize: 8, roundsCount: 2, automated: true }],
      completeAllMatchUps: true,
      startDate: day1,
      endDate: day2,
      setState: true,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const [round1] = matchUps.filter((m: any) => m.roundNumber === 1);
    const [round2] = matchUps.filter((m: any) => m.roundNumber === 2);
    const write = (matchUp: any, scheduledTime: string) =>
      tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: day2, scheduledTime },
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        scheduleCompletedMatchUps: true,
      });
    expect(write(round1, '12:00').success).toEqual(true);
    expect(write(round2, '09:00').success).toEqual(true);
  });
});

describe('bulk writes are judged on the state they leave, and refused whole', () => {
  it('one refused placement refuses the batch, and nothing is written', () => {
    const { at, final } = playedSemifinal();
    const other = at(2, 2);
    const result: any = tournamentEngine.bulkScheduleMatchUps({
      matchUpDetails: [
        { matchUpId: other.matchUpId, schedule: { scheduledDate: day2, scheduledTime: '10:00' } },
        { matchUpId: final.matchUpId, schedule: { scheduledDate: day2, scheduledTime: '09:00' } },
      ],
    });
    expect(result.error).toEqual(ANACHRONISM);
    expect(at(2, 2).schedule?.scheduledTime).toBeUndefined();
    expect(at(3, 1).schedule?.scheduledTime).toBeUndefined();
  });

  it('a batch that moves the played source and its dependent earlier together is accepted, whatever the order', () => {
    const { at, write, semifinal, final } = playedSemifinal();
    expect(write(final, { scheduledDate: day2, scheduledTime: '12:00' }).success).toEqual(true);
    // the final first: alone, 09:00 is before the semifinal's stored 10:00; the batch moves the semifinal to 08:00
    const result: any = tournamentEngine.bulkScheduleMatchUps({
      matchUpDetails: [
        { matchUpId: final.matchUpId, schedule: { scheduledDate: day2, scheduledTime: '09:00' } },
        { matchUpId: semifinal.matchUpId, schedule: { scheduledDate: day2, scheduledTime: '08:00' } },
      ],
      scheduleCompletedMatchUps: true,
    });
    expect(result.success).toEqual(true);
    expect([timeOf(at(2, 1)), timeOf(at(3, 1))]).toEqual(['08:00', '09:00']);
  });

  it('bulkRescheduleMatchUps refuses a shift that puts a matchUp before a played source', () => {
    const { at, write, final } = playedSemifinal();
    expect(write(final, { scheduledDate: day2, scheduledTime: '12:00' }).success).toEqual(true);
    const result: any = tournamentEngine.bulkRescheduleMatchUps({
      matchUpIds: [final.matchUpId],
      scheduleChange: { minutesChange: -180 },
    });
    expect(result.error).toEqual(ANACHRONISM);
    expect(timeOf(at(3, 1))).toEqual('12:00');
  });
});

describe('C2: scheduleMatchUps waits for a matchUp’s sources', () => {
  it('a plain 8 draw: the final is timed after both semifinals, and the semifinals after their quarterfinals', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 4 }],
      drawProfiles: [{ drawSize: 8 }],
      startDate: day1,
      setState: true,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
    const result: any = tournamentEngine.scheduleMatchUps({
      matchUpIds: matchUps.map((m: any) => m.matchUpId),
      scheduleDate: day1,
    });
    expect(result.success).toEqual(true);
    const minutes = (roundNumber: number) =>
      tournamentEngine
        .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [roundNumber] } })
        .matchUps.map((m: any) => timeStringMinutes(timeOf(m)));
    // was: the final at 08:00, both semifinals at 09:00
    expect(Math.min(...minutes(2))).toBeGreaterThan(Math.max(...minutes(1)));
    expect(Math.min(...minutes(3))).toBeGreaterThan(Math.max(...minutes(2)));
  });
});

describe('the profile scheduler asks the played order of a placement once, date and time together', () => {
  it('moving a final from day 3 to day 2, after its played semifinals, is not refused for its old time', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-03'];
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId, courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
      drawProfiles: [
        {
          drawSize: 4,
          outcomes: [1, 2].map((roundPosition) => ({
            roundNumber: 1,
            roundPosition,
            scoreString: '6-1 6-1',
            winningSide: 1,
          })),
        },
      ],
      startDate: days[0],
      endDate: days[2],
      setState: true,
    });
    const at = matchUpAt;
    for (const roundPosition of [1, 2]) {
      const semifinal = at(1, roundPosition);
      const result: any = tournamentEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: days[1], scheduledTime: '12:00' },
        matchUpId: semifinal.matchUpId,
        drawId: semifinal.drawId,
      });
      expect(result.success).toEqual(true);
    }
    const final = at(2, 1);
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: days[2], scheduledTime: '08:00' },
      matchUpId: final.matchUpId,
      drawId: final.drawId,
    });
    expect(result.success).toEqual(true);

    const { tournamentId, eventId, drawId, structureId } = final;
    result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
      scheduleDate: days[1],
      venueId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [days[1]] });
    expect(result.success).toEqual(true);

    // the date was asked alone, against the final's old 08:00: refused as before the 12:00 semifinals, so the final kept
    // day 3 and took the new time there, while the report said it was scheduled on day 2
    const moved = at(2, 1);
    expect(moved.schedule.scheduledDate).toEqual(days[1]);
    expect(timeStringMinutes(timeOf(moved))).toBeGreaterThan(timeStringMinutes('12:00'));
    expect(result.scheduledMatchUpIds[days[1]]).toEqual([final.matchUpId]);
  });
});
