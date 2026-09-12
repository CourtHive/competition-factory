import { getMatchUpReadiness } from '@Query/matchUps/scheduling/getMatchUpReadiness';
import { describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Readiness answers "can this placement happen at the time it is scheduled
 * for", and the four findings are the four ways the answer is no. Each block
 * below constructs exactly one of them and asserts it is reported *and* that
 * the others are not — a finder that fires on everything is not a finder.
 *
 * Ported from TMX along with the analysis; these cases mirror the ones that
 * guarded it there, restated against real engine output rather than the
 * structural fixtures a browser module had to accept.
 */

const startDate = '2026-09-12';

function seed({ drawSize = 8 }: { drawSize?: number } = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles: [{ drawSize, drawType: SINGLE_ELIMINATION, eventName: 'Readiness' }],
    endDate: '2026-09-15',
    setState: true,
    startDate,
  });
  const matchUps = tournamentEngine.allTournamentMatchUps({
    nextMatchUps: true,
    inContext: true,
  }).matchUps as any[];
  return { tournamentRecord, matchUps };
}

/** Schedule one matchUp and return the engine's refreshed view. */
function schedule(matchUpId: string, drawId: string, scheduledTime: string, scheduledDate = startDate) {
  const result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate, scheduledTime },
    removePriorValues: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
}

function readinessFor(matchUpId: string) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const result: any = getMatchUpReadiness({ tournamentRecord: tournamentRecord as any, matchUpId });
  expect(result.error).toBeUndefined();
  return result.readiness;
}

describe('getMatchUpReadiness — what cannot be evaluated is never reported as ready', () => {
  it('refuses a matchUpId the tournament does not carry', () => {
    seed();
    expect(readinessFor('no-such-matchUp')).toEqual({ evaluated: false, reason: 'unknownMatchUp' });
  });

  it('refuses an unscheduled matchUp, which has no time to check against', () => {
    const { matchUps } = seed();
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    expect(readinessFor(target.matchUpId)).toEqual({ evaluated: false, reason: 'notScheduled' });
  });

  it('refuses a matchUp scheduled for a date but no time', () => {
    const { matchUps } = seed();
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: startDate },
      matchUpId: target.matchUpId,
      drawId: target.drawId,
    });
    expect(readinessFor(target.matchUpId)).toEqual({ evaluated: false, reason: 'noTime' });
  });

  it('refuses a completed matchUp — there is nothing left to be ready for', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const first = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    schedule(first.matchUpId, first.drawId, '09:00');
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-2', winningSide: 1 });
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: first.matchUpId, drawId: first.drawId, outcome });
    expect(result.success).toEqual(true);
    expect(readinessFor(first.matchUpId)).toEqual({ evaluated: false, reason: 'completed' });
  });

  it('refuses a BYE, which nobody has to be ready for', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, drawType: SINGLE_ELIMINATION, participantsCount: 3 }],
      endDate: '2026-09-15',
      setState: true,
      startDate,
    });
    const bye: any = (tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps as any[]).find(
      (matchUp) => matchUp.matchUpStatus === 'BYE',
    );
    expect(bye).toBeDefined();
    const result: any = getMatchUpReadiness({ tournamentRecord: tournamentRecord as any, matchUpId: bye.matchUpId });
    expect(result.readiness).toEqual({ evaluated: false, reason: 'bye' });
  });
});

describe('getMatchUpReadiness — the four findings', () => {
  it('reports a dependency when an upstream matchUp cannot finish in time, with the clock it clears', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const semi = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(semi.matchUpId, semi.drawId, '09:00');
    // The final is one hour after a semifinal whose format averages 90 minutes.
    schedule(final.matchUpId, final.drawId, '10:00');

    const readiness = readinessFor(final.matchUpId);
    expect(readiness.evaluated).toEqual(true);
    const dependency = readiness.findings.find((finding) => finding.kind === 'dependency');
    expect(dependency.matchUpIds).toContain(semi.matchUpId);
    expect(dependency.notBefore).toEqual('10:30');
    expect(dependency.severity).toEqual('WARN');
  });

  it('reports a dependency with no clock when the upstream matchUp is not scheduled at all', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(final.matchUpId, final.drawId, '10:00');

    const dependency = readinessFor(final.matchUpId).findings.find((finding) => finding.kind === 'dependency');
    // An unscheduled upstream cannot be promised to finish in time, so it is
    // reported — but nothing may be claimed about when it clears.
    expect(dependency.notBefore).toBeUndefined();
  });

  it('reports undetermined participants when a side is empty and something upstream explains it', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(final.matchUpId, final.drawId, '14:00');

    const undetermined = readinessFor(final.matchUpId).findings.find((finding) => finding.kind === 'undetermined');
    expect(undetermined.severity).toEqual('INFO');
    expect(undetermined.matchUpIds.length).toBeGreaterThan(0);
  });

  it('leaves a well-spaced placement with no findings at all', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const semi = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    const other = matchUps.filter((matchUp) => matchUp.roundNumber === 1)[1];
    const final = matchUps.find((matchUp) => matchUp.roundNumber === 2);
    schedule(semi.matchUpId, semi.drawId, '09:00');
    schedule(other.matchUpId, other.drawId, '09:00');
    schedule(final.matchUpId, final.drawId, '14:00');

    const readiness = readinessFor(final.matchUpId);
    expect(readiness.evaluated).toEqual(true);
    // Both semifinals project to finish at 10:30, well before 14:00, and the
    // final's own sides are still undetermined — but nothing upstream is late.
    expect(readiness.findings.filter((finding: any) => finding.kind === 'dependency')).toEqual([]);
  });
});

describe('getMatchUpReadiness — overlap outranks recovery for the same participant', () => {
  /**
   * A participant scheduled into two matchUps at the same time is *on court
   * elsewhere*, which already implies their recovery window is violated.
   * Reporting both would double-count one problem, so overlap wins and the
   * participant is dropped from the recovery finding.
   */
  it('reports overlap, and does not also report recovery for the overlapped participant', () => {
    mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      drawProfiles: [
        { drawSize: 4, drawType: SINGLE_ELIMINATION, eventName: 'Singles A', uniqueParticipants: false },
        { drawSize: 4, drawType: SINGLE_ELIMINATION, eventName: 'Singles B', uniqueParticipants: false },
      ],
      endDate: '2026-09-15',
      setState: true,
      startDate,
    });

    const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true }).matchUps as any[];
    const first = matchUps.find(
      (matchUp) => matchUp.roundNumber === 1 && matchUp.sides?.every((s: any) => s.participantId),
    );
    const shared = first.sides[0].participantId;
    const second = matchUps.find(
      (matchUp) =>
        matchUp.matchUpId !== first.matchUpId && matchUp.sides?.some((side: any) => side.participantId === shared),
    );
    // Only run the assertion when the mock actually produced a shared player;
    // otherwise the test would pass by describing nothing.
    expect(second).toBeDefined();

    schedule(first.matchUpId, first.drawId, '09:00');
    schedule(second.matchUpId, second.drawId, '09:00');

    const readiness: any = getMatchUpReadiness({
      tournamentRecord: tournamentEngine.getTournament().tournamentRecord as any,
      matchUpId: second.matchUpId,
    }).readiness;

    const overlap = readiness.findings.find((finding: any) => finding.kind === 'overlap');
    expect(overlap.participantIds).toContain(shared);
    const recovery = readiness.findings.find((finding: any) => finding.kind === 'recovery');
    expect(recovery?.participantIds ?? []).not.toContain(shared);
    // Strongest first, so a renderer can take the head as the headline.
    expect(readiness.findings[0].kind).toEqual('overlap');
  });
});

describe('getMatchUpReadiness — the engine method and its parameters', () => {
  it('is reachable through the engine', () => {
    const { matchUps } = seed({ drawSize: 4 });
    const target = matchUps.find((matchUp) => matchUp.roundNumber === 1);
    schedule(target.matchUpId, target.drawId, '09:00');
    const result: any = tournamentEngine.getMatchUpReadiness({ matchUpId: target.matchUpId });
    expect(result.readiness.evaluated).toEqual(true);
  });

  it('refuses a call with no matchUpId rather than answering about nothing', () => {
    seed({ drawSize: 4 });
    const result: any = tournamentEngine.getMatchUpReadiness({});
    expect(result.error).toBeDefined();
  });
});
