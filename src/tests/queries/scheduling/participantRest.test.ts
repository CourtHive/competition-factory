import { getParticipantRest } from '@Query/matchUps/scheduling/getParticipantRest';
import { describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Rest is anchored on a caller-supplied `asOf`, which is the whole reason it
 * can live in the factory: there is no clock here, and every case below states
 * the instant it is asking about rather than inheriting one.
 *
 * The cases mirror the ones that guarded this analysis in TMX, restated against
 * real engine output and real UTC instants — which is the substantive change in
 * the port. TMX worked in minutes-since-midnight because a browser module
 * cannot resolve a named zone; the apparatus that needed (a ±1-day clamp, a
 * projected "now") is gone, so the assertions here are about intervals rather
 * than about the clamp.
 */

const startDate = '2026-09-12';
/** 09:00 venue-local on the day under test, in UTC. The frame below is UTC, so they coincide. */
const at = (clock: string) => `${startDate}T${clock}:00.000Z`;

function seed() {
  mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, eventName: 'Rest' }],
    endDate: '2026-09-15',
    setState: true,
    startDate,
  });
  return tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[];
}

function schedule(matchUp: any, scheduledTime: string, extra: Record<string, any> = {}) {
  const result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: startDate, scheduledTime, ...extra },
    removePriorValues: true,
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  expect(result.success).toEqual(true);
}

function restFor(matchUpId: string, asOf: string) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const result: any = getParticipantRest({ tournamentRecord: tournamentRecord as any, matchUpId, asOf });
  expect(result.error).toBeUndefined();
  return result.rest;
}

/** Complete a matchUp and stamp when it ended, the way an operator's END_TIME does. */
function completeAt(matchUp: any, endTime: string) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
  const status = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    outcome,
  });
  expect(status.success).toEqual(true);
  schedule(matchUp, matchUp.schedule?.scheduledTime ?? '09:00', { endTime });
}

describe('getParticipantRest — what cannot be measured is never reported as rested', () => {
  it('refuses a matchUpId the tournament does not carry', () => {
    seed();
    expect(restFor('no-such-matchUp', at('12:00'))).toEqual({ evaluated: false, reason: 'unknownMatchUp' });
  });

  it('refuses to substitute a clock it does not have', () => {
    const matchUps = seed();
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    schedule(target, '09:00');
    const { tournamentRecord } = tournamentEngine.getTournament();
    const result: any = getParticipantRest({
      tournamentRecord: tournamentRecord as any,
      matchUpId: target.matchUpId,
      asOf: 'not-an-instant',
    });
    expect(result.rest).toEqual({ evaluated: false, reason: 'noAsOf' });
  });

  it('refuses a completed matchUp', () => {
    const matchUps = seed();
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    schedule(target, '09:00');
    completeAt(target, '10:20');
    expect(restFor(target.matchUpId, at('12:00'))).toMatchObject({ evaluated: false, reason: 'completed' });
  });
});

describe('getParticipantRest — the ladder and the interval', () => {
  it('reports no prior match when nobody on the card has played yet', () => {
    const matchUps = seed();
    const first = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[0];
    const second = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[1];
    schedule(first, '09:00');
    schedule(second, '09:00');

    const rest = restFor(second.matchUpId, at('08:00'));
    expect(rest.evaluated).toEqual(true);
    expect(rest.rows.every((row: any) => row.status === 'none')).toEqual(true);
  });

  it('measures rest from a recorded end time, and names that rung', () => {
    const matchUps = seed();
    const semis = matchUps.filter((matchUp) => matchUp.roundNumber === 1);
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(semis[0], '09:00');
    completeAt(semis[0], '10:20');
    schedule(final, '14:00');

    // The winner of the first semifinal is now in the final; 12:00 is 100
    // minutes after their recorded finish.
    const rest = restFor(final.matchUpId, at('12:00'));
    const measured = rest.rows.find((row: any) => row.source === 'endTime');
    expect(measured.restMinutes).toEqual(100);
    expect(measured.status).toEqual('rested');
    expect(measured.fromMatchUpId).toEqual(semis[0].matchUpId);
  });

  it('reports a participant still on court, with no rest figure and a projected readyAt', () => {
    // Two draws sharing a field, so one player can be under way in one matchUp
    // while being asked about in another — which is the state the whole
    // `onCourt` band exists for.
    mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfiles: [
        { drawSize: 4, drawType: SINGLE_ELIMINATION, eventName: 'A', uniqueParticipants: false },
        { drawSize: 4, drawType: SINGLE_ELIMINATION, eventName: 'B', uniqueParticipants: false },
      ],
      endDate: '2026-09-15',
      setState: true,
      startDate,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[];
    const playable = matchUps.filter(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.sides?.every((side: any) => side.participantId),
    );
    const live = playable[0];
    const shared = live.sides[0].participantId;
    const other = playable.find(
      (matchUp) =>
        matchUp.matchUpId !== live.matchUpId && matchUp.sides.some((side: any) => side.participantId === shared),
    );
    expect(other).toBeDefined();

    schedule(live, '09:00');
    schedule(other, '11:00');

    const rest = restFor(other.matchUpId, at('09:30'));
    const onCourt = rest.rows.find((row: any) => row.participantId === shared);
    expect(onCourt.status).toEqual('onCourt');
    // No interval: rest has not started, so a minutes figure would be fiction.
    expect(onCourt.restMinutes).toBeUndefined();
    // 09:00 + the format's 90-minute average projects a 10:30 finish, plus the
    // 60 minutes of singles recovery the default scheduling policy requires.
    expect(onCourt.readyAt).toEqual('11:30');
    expect(onCourt.fromMatchUpId).toEqual(live.matchUpId);
    // Worst-first: the on-court player is the headline.
    expect(rest.rows[0].participantId).toEqual(shared);
  });

  it('names the day it cannot choose, rather than blaming the matchUp', () => {
    const matchUps = seed();
    const unscheduled = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[0];
    expect(restFor(unscheduled.matchUpId, at('12:00'))).toEqual({ evaluated: false, reason: 'noDay' });
  });

  it('counts the day’s load and reports which match of the day this would be', () => {
    const matchUps = seed();
    const semis = matchUps.filter((matchUp) => matchUp.roundNumber === 1);
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(semis[0], '09:00');
    completeAt(semis[0], '10:20');
    schedule(final, '14:00');

    const rest = restFor(final.matchUpId, at('12:00'));
    const played = rest.rows.find((row: any) => row.load.total === 1);
    expect(played.load.ordinal).toEqual(2);
    expect(played.load.singles).toEqual(1);
  });

  it('reports the day it measured and the instant it measured at', () => {
    const matchUps = seed();
    const target = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[0];
    schedule(target, '09:00');
    const rest = restFor(target.matchUpId, at('08:00'));
    expect(rest.scheduledDate).toEqual(startDate);
    expect(rest.asOf).toEqual(at('08:00'));
  });
});

describe('getParticipantRest — a walkover is not load the director has spent', () => {
  it('does not count a walkover as a prior match', () => {
    const matchUps = seed();
    const semis = matchUps.filter((matchUp) => matchUp.roundNumber === 1);
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(semis[0], '09:00');
    const status = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      matchUpId: semis[0].matchUpId,
      drawId: semis[0].drawId,
    });
    expect(status.success).toEqual(true);
    schedule(final, '14:00');

    const rest = restFor(final.matchUpId, at('12:00'));
    // The walkover winner is in the final having played nothing: no rest
    // requirement, and no slot consumed against a daily limit.
    expect(rest.rows.every((row: any) => row.status === 'none')).toEqual(true);
    expect(rest.rows.every((row: any) => row.load.total === 0)).toEqual(true);
  });
});

describe('getParticipantRest — the engine method', () => {
  it('is reachable through the engine', () => {
    const matchUps = seed();
    const target = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[0];
    schedule(target, '09:00');
    const result: any = tournamentEngine.getParticipantRest({ matchUpId: target.matchUpId, asOf: at('08:00') });
    expect(result.rest.evaluated).toEqual(true);
  });

  it('refuses a call with no matchUpId', () => {
    seed();
    const result: any = tournamentEngine.getParticipantRest({ asOf: at('08:00') });
    expect(result.error).toBeDefined();
  });
});
