import { getParticipantRest, getParticipantsRest } from '@Query/matchUps/scheduling/getParticipantRest';
import { getParticipantRest as oracleParticipantRest } from './oracle/participantRestOracle';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { MISSING_MATCHUP_ID } from '@Constants/errorConditionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * The batch (`getParticipantsRest`) must answer every request exactly as the single-call implementation
 * that shipped before it did. The oracle is that implementation, copied verbatim; every matchUp of a
 * tournament built to exercise each rung of the rest ladder is asked about at several instants, on
 * several days and in several frames, all in ONE batch call, and each answer must deep-equal the
 * oracle's. The single call, now a batch of one, is held to the oracle the same way.
 */

const day1 = '2026-09-12';
const day2 = '2026-09-13';
const utc = (date: string, clock: string) => `${date}T${clock}:00.000Z`;
const plusMinutes = (clock: string, minutes: number) => {
  const [hours, mins] = clock.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function schedule(matchUp: any, schedule: Record<string, any>) {
  const result = tournamentEngine.addMatchUpScheduleItems({
    removePriorValues: true,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    schedule,
  });
  expect(result.success, JSON.stringify(result.error)).toEqual(true);
}

function complete(matchUp: any, winningSide: 1 | 2 = 1) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide });
  const result = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, outcome });
  expect(result.success).toEqual(true);
}

/**
 * Round 1 carries one rest source per matchUp, rotating through the ladder: a recorded endTime, a score with
 * no endTime (scoredTime), started but unfinished, called but not started, scheduled on a court only, a
 * walkover, and unscheduled. Round 2 is scheduled later in the day with some sides decided, so undecided
 * sides (pending rows) and feeders appear. Doubles share the day with singles.
 */
function seedLadderTournament() {
  const {
    drawIds: [singlesDrawId, doublesDrawId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles: [
      { drawSize: 16, eventType: SINGLES_EVENT, eventName: 'Singles' },
      { drawSize: 8, eventType: DOUBLES_EVENT, eventName: 'Doubles' },
    ],
    venueProfiles: [{ courtsCount: 6 }],
    startDate: day1,
    endDate: day2,
    nonRandom: 1,
    setState: true,
  });

  const matchUps = () => tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[];
  const courtIds = (tournamentEngine.getVenuesAndCourts().courts ?? []).map((court: any) => court.courtId);
  const round = (drawId: string, roundNumber: number) =>
    matchUps()
      .filter((matchUp) => matchUp.drawId === drawId && matchUp.roundNumber === roundNumber)
      .sort((a, b) => a.roundPosition - b.roundPosition);

  const singlesR1 = round(singlesDrawId, 1);
  singlesR1.forEach((matchUp, i) => {
    const scheduledTime = `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    const courtId = courtIds[i % courtIds.length];
    switch (i % 7) {
      case 0: // measured: completed with a recorded finish
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId });
        complete(matchUp);
        schedule(matchUp, {
          endTime: plusMinutes(scheduledTime, 70),
          startTime: scheduledTime,
          scheduledDate: day1,
          scheduledTime,
          courtId,
        });
        break;
      case 1: // proxy: completed, scored, no endTime
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId });
        complete(matchUp, 2);
        break;
      case 2: // started, not finished
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId, startTime: scheduledTime });
        break;
      case 3: // called, not started
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId, calledAt: utc(day1, scheduledTime) });
        break;
      case 4: // scheduled on a court only
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId });
        break;
      case 5: {
        // a walkover is not load
        schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId });
        const result = tournamentEngine.setMatchUpStatus({
          outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
          matchUpId: matchUp.matchUpId,
          drawId: matchUp.drawId,
        });
        expect(result.success, JSON.stringify(result.error)).toEqual(true);
        break;
      }
      default: // unscheduled
        break;
    }
  });

  // Round 2 later the same day: some sides decided by round 1, some still to come.
  round(singlesDrawId, 2).forEach((matchUp, i) =>
    schedule(matchUp, { scheduledDate: day1, scheduledTime: `${13 + i}:00`, courtId: courtIds[i % courtIds.length] }),
  );

  // Doubles the same day: one finished early, one in progress, the rest scheduled.
  const doublesR1 = round(doublesDrawId, 1);
  doublesR1.forEach((matchUp, i) => {
    const scheduledTime = `${String(8 + i).padStart(2, '0')}:00`;
    schedule(matchUp, { scheduledDate: day1, scheduledTime, courtId: courtIds[(i + 3) % courtIds.length] });
  });
  complete(doublesR1[0]);
  schedule(doublesR1[1], {
    scheduledDate: day1,
    scheduledTime: '09:00',
    courtId: courtIds[4],
    startTime: '09:05',
  });

  // An undated score: no scheduledDate, so the day comes from scoredTime.
  const undated = round(singlesDrawId, 1).find((matchUp) => !matchUp.schedule?.scheduledDate && !matchUp.winningSide);
  if (undated) complete(undated);

  return matchUps();
}

const INSTANTS = [
  utc(day1, '07:30'),
  utc(day1, '09:20'),
  utc(day1, '10:15'),
  utc(day1, '12:00'),
  utc(day1, '18:45'),
  utc(day2, '09:00'),
  'not-an-instant',
];
const DAYS = [undefined, day1, day2];
const FRAMES: Record<string, any>[] = [{}, { timeZone: 'America/New_York' }, { utcOffsetMinutes: 120 }];

describe('getParticipantsRest — answer for answer, the single-call implementation it replaces', () => {
  it('a batch over every matchUp, instant, day and frame deep-equals the oracle per request', () => {
    const matchUps = seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const ids = [...matchUps.map((matchUp) => matchUp.matchUpId), 'no-such-matchUp'];

    let compared = 0;
    let evaluated = 0;
    const statuses = new Set<string>();
    for (const frame of FRAMES) {
      const requests = ids.flatMap((matchUpId) =>
        INSTANTS.flatMap((asOf) => DAYS.map((scheduledDate) => ({ matchUpId, asOf, scheduledDate }))),
      );
      const batch: any = getParticipantsRest({ tournamentRecord: tournamentRecord as any, requests, ...frame });
      expect(batch.error).toBeUndefined();
      expect(batch.rests).toHaveLength(requests.length);

      requests.forEach((request, i) => {
        const oracle: any = oracleParticipantRest({
          tournamentRecord: tournamentRecord as any,
          ...request,
          ...frame,
        });
        expect(batch.rests[i], JSON.stringify({ request, frame })).toEqual(oracle.rest);
        compared += 1;
        if (oracle.rest?.evaluated) {
          evaluated += 1;
          for (const row of oracle.rest.rows) statuses.add(row.status);
        }
      });
    }

    // The scenario must actually exercise the analysis, or the equality above proves little.
    expect(compared).toBeGreaterThan(1000);
    expect(evaluated).toBeGreaterThan(200);
    for (const status of ['onCourt', 'resting', 'rested', 'none']) expect(statuses.has(status), status).toBe(true);
  });

  it('the single call, now a batch of one, deep-equals the oracle too', () => {
    const matchUps = seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    for (const matchUp of matchUps) {
      for (const asOf of INSTANTS) {
        const params = { tournamentRecord: tournamentRecord as any, matchUpId: matchUp.matchUpId, asOf };
        expect(getParticipantRest(params)).toEqual(oracleParticipantRest(params));
      }
    }
  });

  it('answers in request order, so one matchUp asked about on two days gets two answers', () => {
    const matchUps = seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 2 && matchUp.schedule?.scheduledDate);
    const requests = [
      { matchUpId: target.matchUpId, asOf: utc(day1, '18:45'), scheduledDate: day1 },
      { matchUpId: target.matchUpId, asOf: utc(day2, '09:00'), scheduledDate: day2 },
    ];
    const { rests }: any = getParticipantsRest({ tournamentRecord: tournamentRecord as any, requests });
    expect(rests.map((rest: any) => rest.scheduledDate)).toEqual([day1, day2]);
  });

  it('refuses a request with no matchUpId, naming which one', () => {
    seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const result: any = getParticipantsRest({
      tournamentRecord: tournamentRecord as any,
      requests: [{ matchUpId: 'x', asOf: utc(day1, '12:00') }, { asOf: utc(day1, '12:00') } as any],
    });
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
    expect(result.context).toEqual({ requestIndex: 1 });
  });

  it('refuses a call without requests: there is no implicit "every matchUp"', () => {
    seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const result: any = getParticipantsRest({ tournamentRecord: tournamentRecord as any } as any);
    expect(result.error).toBeDefined();
    expect(result.rests).toBeUndefined();
  });

  it('an empty request list answers nothing', () => {
    seedLadderTournament();
    const { tournamentRecord } = tournamentEngine.getTournament();
    expect(getParticipantsRest({ tournamentRecord: tournamentRecord as any, requests: [] })).toEqual({ rests: [] });
  });
});
