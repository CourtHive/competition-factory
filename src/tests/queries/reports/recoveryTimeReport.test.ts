import { PARTICIPANT_EXPERIENCE_REPORT, PARTICIPANT_RECOVERY_REPORT } from '@Constants/reportConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

const DATE = '2026-08-20';
const NEXT_DATE = '2026-08-21';

/**
 * Build a tournament in which ONE known individual plays two matchUps whose gap
 * we control exactly, so a deficit can be asserted rather than hoped for.
 *
 * Everything is written as venue-local wall clock and read back with
 * `utcOffsetMinutes: 0`, so the arithmetic is frame-independent and the test
 * holds in any timezone rather than only under TZ=UTC.
 */
function seedTwoMatchDay({ secondStart, secondDate = DATE }: { secondStart: string; secondDate?: string }) {
  // The tournament must span both dates: `addMatchUpScheduledDate` rejects a
  // date outside start/end with ERR_INVALID_DATE, and a matchUp with no
  // scheduledDate is undatable and correctly excluded from the timeline.
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventName: 'Singles', matchUpFormat: 'SET3-S:6/TB7' }],
    completeAllMatchUps: true,
    endDate: NEXT_DATE,
    startDate: DATE,
    setState: true,
    nonRandom: 1,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
  const first = matchUps.find((m: any) => m.roundNumber === 1);
  const final = matchUps.find((m: any) => m.roundNumber === 2);

  // The R1 winner is the individual who appears in both matchUps.
  const winnerId = first.sides.find((s: any) => s.sideNumber === first.winningSide)?.participantId;

  const schedule = (matchUp: any, { scheduledTime, startTime, endTime, scheduledDate }: any) => {
    tournamentEngine.addMatchUpScheduledTime({
      drawId: matchUp.drawId,
      matchUpId: matchUp.matchUpId,
      scheduledTime,
    });
    tournamentEngine.addMatchUpScheduledDate({
      drawId: matchUp.drawId,
      matchUpId: matchUp.matchUpId,
      scheduledDate,
    });
    tournamentEngine.addMatchUpStartTime({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId, startTime });
    if (endTime) tournamentEngine.addMatchUpEndTime({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId, endTime });
  };

  schedule(first, { scheduledDate: DATE, scheduledTime: '09:00', startTime: '09:00', endTime: '10:00' });
  schedule(final, { scheduledDate: secondDate, scheduledTime: secondStart, startTime: secondStart });

  return { winnerId, firstMatchUpId: first.matchUpId, finalMatchUpId: final.matchUpId };
}

const generate = (reportId: string) =>
  tournamentEngine.generateReport({ reportId, parameters: { utcOffsetMinutes: 0 } }) as any;

describe('Participant Recovery Time report', () => {
  it('reports a deficit when the gap is shorter than the policy requires', () => {
    // R1 ends 10:00; the final starts 10:20 — a 20 minute gap against the
    // POLICY_SCHEDULING_DEFAULT singles requirement of 60.
    const { winnerId } = seedTwoMatchDay({ secondStart: '10:20' });

    const result = generate(PARTICIPANT_RECOVERY_REPORT);
    expect(result.error).toBeUndefined();

    const row = result.rows.find((r: any) => r.participantId === winnerId && r.matchNumber === 2);
    expect(row).toBeTruthy();
    expect(row.recoveryReceived).toEqual(20);
    expect(row.recoveryRequired).toEqual(60);
    expect(row.recoveryDeficit).toEqual(40);
    expect(result.summary.shortRecoveryCount).toBeGreaterThan(0);
    expect(result.summary.worstRecoveryDeficit).toEqual(40);
  });

  it('reports NO deficit when the gap is sufficient — the detector is not stuck on', () => {
    // Same fixture, final at 11:30: a 90 minute gap against the same 60 required.
    const { winnerId } = seedTwoMatchDay({ secondStart: '11:30' });

    const result = generate(PARTICIPANT_RECOVERY_REPORT);
    const row = result.rows.find((r: any) => r.participantId === winnerId && r.matchNumber === 2);
    expect(row.recoveryReceived).toEqual(90);
    expect(row.recoveryDeficit).toEqual(0);
    expect(result.summary.worstRecoveryDeficit).toEqual(0);
  });

  it('uses the measured duration and says so when start and end are both recorded', () => {
    const { winnerId } = seedTwoMatchDay({ secondStart: '10:20' });
    const result = generate(PARTICIPANT_RECOVERY_REPORT);

    const firstRow = result.rows.find((r: any) => r.participantId === winnerId && r.matchNumber === 1);
    // 09:00 → 10:00 measured, NOT the format's 90 minute average.
    expect(firstRow.durationMinutes).toEqual(60);
    expect(firstRow.durationSource).toEqual('measured');
    expect(firstRow.finishSource).toEqual('endTime');
  });

  it('scopes a cross-day gap to overnight rather than reporting a vast recovery surplus', () => {
    const { winnerId } = seedTwoMatchDay({ secondStart: '08:00', secondDate: NEXT_DATE });
    const result = generate(PARTICIPANT_RECOVERY_REPORT);

    const row = result.rows.find((r: any) => r.participantId === winnerId && r.scheduledDate === NEXT_DATE);
    expect(row).toBeTruthy();
    // 10:00 day one → 08:00 day two = 22 hours, reported as overnight...
    expect(row.overnightReceived).toEqual(22 * 60);
    // ...and NOT as a same-day recovery, which would manufacture a 1260-minute
    // surplus on the first matchUp of every day.
    expect(row.recoveryReceived).toBeUndefined();
    expect(row.recoveryDeficit).toBeUndefined();
  });

  it('excludes walkovers — a player who did not take the court is not charged recovery', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventName: 'Singles' }],
      completeAllMatchUps: true,
      endDate: NEXT_DATE,
      startDate: DATE,
      setState: true,
      nonRandom: 1,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
    const round1 = matchUps.filter((m: any) => m.roundNumber === 1);
    // BOTH R1 matchUps are scheduled so the report still has rows after one is
    // turned into a walkover — otherwise it errors on an empty timeline and the
    // assertion would pass for the wrong reason.
    for (const matchUp of round1) {
      tournamentEngine.addMatchUpScheduledDate({
        matchUpId: matchUp.matchUpId,
        scheduledDate: DATE,
        drawId: matchUp.drawId,
      });
      tournamentEngine.addMatchUpStartTime({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        startTime: '09:00',
      });
    }
    const target = round1[0];

    const before = generate(PARTICIPANT_RECOVERY_REPORT);
    expect(before.rows.filter((r: any) => r.matchUpId === target.matchUpId).length).toBeGreaterThan(0);

    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      matchUpId: target.matchUpId,
      drawId: target.drawId,
    });

    const after = generate(PARTICIPANT_RECOVERY_REPORT);
    expect(after.error).toBeUndefined();
    // The walkover contributes nothing...
    expect(after.rows.filter((r: any) => r.matchUpId === target.matchUpId).length).toEqual(0);
    // ...while the other scheduled matchUp still does, proving the exclusion is
    // targeted rather than a wholesale collapse of the timeline.
    expect(after.rows.filter((r: any) => r.matchUpId === round1[1].matchUpId).length).toBeGreaterThan(0);
  });

  it('surfaces how much of the court time is estimated rather than observed', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventName: 'Singles' }],
      completeAllMatchUps: true,
      endDate: NEXT_DATE,
      startDate: DATE,
      setState: true,
      nonRandom: 1,
    });
    const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
    for (const matchUp of matchUps) {
      tournamentEngine.addMatchUpScheduledDate({
        matchUpId: matchUp.matchUpId,
        scheduledDate: DATE,
        drawId: matchUp.drawId,
      });
      tournamentEngine.addMatchUpScheduledTime({
        matchUpId: matchUp.matchUpId,
        scheduledTime: '09:00',
        drawId: matchUp.drawId,
      });
    }

    const result = generate(PARTICIPANT_RECOVERY_REPORT);
    // No start or end recorded anywhere, so every duration is the policy's
    // prediction. The summary must say so rather than let an average built
    // entirely from estimates read as a finding.
    expect(result.summary.estimatedDurationPercentage).toBeGreaterThan(0);
    expect(result.rows.every((r: any) => r.durationSource === 'estimated')).toBe(true);
  });
});

describe('Participant Experience report', () => {
  it('rolls the same timeline up per participant', () => {
    const { winnerId } = seedTwoMatchDay({ secondStart: '10:20' });

    const result = generate(PARTICIPANT_EXPERIENCE_REPORT);
    expect(result.error).toBeUndefined();

    const row = result.rows.find((r: any) => r.participantId === winnerId);
    expect(row.matchesPlayed).toEqual(2);
    expect(row.daysPlayed).toEqual(1);
    expect(row.busiestDayMatches).toEqual(2);
    expect(row.shortRecoveryCount).toEqual(1);
    expect(row.worstRecoveryDeficit).toEqual(40);
    // Worst experience sorts first.
    expect(result.rows[0].participantId).toEqual(winnerId);
  });

  it('agrees with the per-appearance report on who was short-rested', () => {
    seedTwoMatchDay({ secondStart: '10:20' });

    const log = generate(PARTICIPANT_RECOVERY_REPORT);
    const rollup = generate(PARTICIPANT_EXPERIENCE_REPORT);

    const shortInLog = new Set(
      log.rows.filter((r: any) => (r.recoveryDeficit ?? 0) > 0).map((r: any) => r.participantId),
    );
    const shortInRollup = new Set(
      rollup.rows.filter((r: any) => r.shortRecoveryCount > 0).map((r: any) => r.participantId),
    );
    // Both derive from one core; a divergence means the roll-up drifted.
    expect([...shortInRollup].sort()).toEqual([...shortInLog].sort());
  });

  it('does not count a short night when no overnight rule is configured', () => {
    // An ADULT tournament: POLICY_SCHEDULING_DEFAULT gives overnight 0, meaning
    // "no rule". A 4-hour turnaround must NOT be flagged.
    const { winnerId } = seedTwoMatchDay({ secondStart: '02:00', secondDate: NEXT_DATE });
    const result = generate(PARTICIPANT_EXPERIENCE_REPORT);
    const row = result.rows.find((r: any) => r.participantId === winnerId);
    expect(row.worstOvernight).toEqual(16 * 60);
    expect(row.shortOvernightCount).toEqual(0);
  });
});
