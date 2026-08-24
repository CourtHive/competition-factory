import { PARTICIPANT_EXPERIENCE_REPORT, PARTICIPANT_RECOVERY_REPORT } from '@Constants/reportConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

const DAY1 = '2026-08-20';
const DAY2 = '2026-08-21';

function seedTwoDays({ categoryType, day2Start = '06:00' }: { categoryType?: string; day2Start?: string } = {}) {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        ...(categoryType && { category: { categoryType } }),
        drawProfiles: [{ drawSize: 4, matchUpFormat: 'SET3-S:6/TB7' }],
        eventName: 'Singles',
      },
    ],
    completeAllMatchUps: true,
    startDate: DAY1,
    endDate: DAY2,
    setState: true,
    nonRandom: 1,
  });

  const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
  const first: any = matchUps.find((m: any) => m.roundNumber === 1);
  const final: any = matchUps.find((m: any) => m.roundNumber === 2);
  const winnerId = first.sides.find((s: any) => s.sideNumber === first.winningSide)?.participantId;

  const place = (matchUp: any, scheduledDate: string, scheduledTime: string, startTime: string, endTime?: string) => {
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      scheduledDate,
    });
    tournamentEngine.addMatchUpScheduledTime({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      scheduledTime,
    });
    tournamentEngine.addMatchUpStartTime({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId, startTime });
    if (endTime) tournamentEngine.addMatchUpEndTime({ drawId: matchUp.drawId, matchUpId: matchUp.matchUpId, endTime });
  };

  // Day one: expected 09:00, played 20:00–22:00 — an eleven-hour day, most of it
  // spent waiting, and two hours of it on court.
  place(first, DAY1, '09:00', '20:00', '22:00');
  place(final, DAY2, day2Start, day2Start);

  return { winnerId };
}

const experience = (winnerId: string) => {
  const result: any = tournamentEngine.generateReport({
    reportId: PARTICIPANT_EXPERIENCE_REPORT,
    parameters: { utcOffsetMinutes: 0 },
  });
  return { result, row: result.rows.find((r: any) => r.participantId === winnerId) };
};

describe('Participant Experience — overnight', () => {
  it('flags a short night for a JUNIOR event, where the 12-hour rule applies', () => {
    // 22:00 to 06:00 is eight hours against the 720-minute junior requirement in
    // POLICY_SCHEDULING_DEFAULT.
    const { winnerId } = seedTwoDays({ categoryType: 'JUNIOR' });
    const { result, row } = experience(winnerId);

    expect(row.worstOvernight).toEqual(8 * 60);
    expect(row.shortOvernightCount).toEqual(1);
    expect(result.summary.participantsWithShortOvernight).toBeGreaterThan(0);
  });

  it('does NOT flag the same night for an ADULT event, where no rule is configured', () => {
    // The identical eight-hour turnaround. An overnight requirement of 0 means
    // "no rule" — counting it would invent a constraint the policy never stated.
    const { winnerId } = seedTwoDays({ categoryType: 'ADULT' });
    const { result, row } = experience(winnerId);

    expect(row.worstOvernight).toEqual(8 * 60);
    expect(row.shortOvernightCount).toEqual(0);
    expect(result.summary.participantsWithShortOvernight).toEqual(0);
  });

  it('does not flag a JUNIOR night that clears the requirement', () => {
    // 22:00 to 11:00 is thirteen hours — over the twelve required.
    const { winnerId } = seedTwoDays({ categoryType: 'JUNIOR', day2Start: '11:00' });
    const { row } = experience(winnerId);
    expect(row.worstOvernight).toEqual(13 * 60);
    expect(row.shortOvernightCount).toEqual(0);
  });
});

describe('Participant Experience — waiting and day length', () => {
  it('measures the day from when the participant was expected, not when they played', () => {
    const { winnerId } = seedTwoDays({ categoryType: 'ADULT' });
    const { row } = experience(winnerId);

    // Told 09:00, finished 22:00 — thirteen hours of the participant's day,
    // of which two were on court. Anchoring on the first START would report
    // two hours and erase the eleven spent waiting.
    expect(row.longestDayMinutes).toEqual(13 * 60);
    expect(row.courtMinutes).toBeGreaterThan(0);
    expect(row.daysPlayed).toEqual(2);
    expect(row.matchesPlayed).toEqual(2);
    expect(row.busiestDayMatches).toEqual(1);
  });

  it('reports mean and max wait from planned time to actual call', () => {
    const { winnerId } = seedTwoDays({ categoryType: 'ADULT' });
    const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
    const first: any = matchUps.find((m: any) => m.roundNumber === 1);

    // Planned 09:00, called 12:00 — the "told 10:00, walked on at 12:40" number.
    const called = tournamentEngine.setMatchUpCalledAt({
      calledAt: `${DAY1}T12:00:00.000Z`,
      matchUpId: first.matchUpId,
      drawId: first.drawId,
    });
    expect(called.error).toBeUndefined();

    const { row } = experience(winnerId);
    // Only one matchUp carries a call, so mean and max are the same 180 minutes.
    expect(row.maxWaitMinutes).toEqual(180);
    expect(row.meanWaitMinutes).toEqual(180);
  });

  it('leaves wait undefined when nothing was ever called to court', () => {
    const { winnerId } = seedTwoDays({ categoryType: 'ADULT' });
    const { row } = experience(winnerId);
    // Absent, not zero — a matchUp never called has no wait, and reporting 0
    // would read as "called exactly on time".
    expect(row.maxWaitMinutes).toBeUndefined();
    expect(row.meanWaitMinutes).toBeUndefined();
  });
});

describe('Participant Experience — singles/doubles type change', () => {
  it('applies the larger type-change recovery when a participant crosses formats', () => {
    // POLICY_SCHEDULING_DEFAULT recovery: DOUBLES 30, singles 60. A policy with an
    // explicit DOUBLES_SINGLES figure proves the crossing is detected rather than
    // the plain doubles recovery being reused.
    const policyDefinitions = {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: {
          averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { DOUBLES: 30, DOUBLES_SINGLES: 120, default: 60 } }],
        },
      },
    };

    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 4, eventName: 'Doubles', eventType: 'DOUBLES' },
        { drawSize: 8, eventName: 'Singles' },
      ],
      completeAllMatchUps: true,
      startDate: DAY1,
      endDate: DAY1,
      setState: true,
      nonRandom: 1,
    });

    const matchUps: any[] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps ?? [];
    const individualsOf = (matchUp: any): string[] =>
      (matchUp.sides ?? []).flatMap((side: any) =>
        matchUp.matchUpType === 'DOUBLES'
          ? (side.participant?.individualParticipantIds ?? [])
          : [side.participantId].filter(Boolean),
      );

    // Find a real crossing rather than assuming the two draws share players —
    // separate drawProfiles need not draw from overlapping pools, and a test
    // that silently found none would assert nothing.
    let pair: { doubles: any; singles: any } | undefined;
    for (const doubles of matchUps.filter((m) => m.matchUpType === 'DOUBLES')) {
      const ids = new Set(individualsOf(doubles));
      const singles = matchUps.find((m) => m.matchUpType === 'SINGLES' && individualsOf(m).some((id) => ids.has(id)));
      if (singles) {
        pair = { doubles, singles };
        break;
      }
    }
    expect(pair, 'seed produced no participant playing both doubles and singles').toBeTruthy();

    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: pair!.doubles.matchUpId,
      drawId: pair!.doubles.drawId,
      scheduledDate: DAY1,
    });
    tournamentEngine.addMatchUpStartTime({
      matchUpId: pair!.doubles.matchUpId,
      drawId: pair!.doubles.drawId,
      startTime: '09:00',
    });
    tournamentEngine.addMatchUpEndTime({
      matchUpId: pair!.doubles.matchUpId,
      drawId: pair!.doubles.drawId,
      endTime: '10:00',
    });
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: pair!.singles.matchUpId,
      drawId: pair!.singles.drawId,
      scheduledDate: DAY1,
    });
    tournamentEngine.addMatchUpStartTime({
      matchUpId: pair!.singles.matchUpId,
      drawId: pair!.singles.drawId,
      startTime: '10:30',
    });

    const result: any = tournamentEngine.generateReport({
      reportId: PARTICIPANT_RECOVERY_REPORT,
      parameters: { utcOffsetMinutes: 0, policyDefinitions },
    });
    expect(result.error).toBeUndefined();

    // The crossing participant is measured against 120, not the plain doubles 30.
    const crossings = result.rows.filter((r: any) => r.matchNumber === 2 && r.recoveryRequired === 120);
    expect(crossings.length).toBeGreaterThan(0);
    expect(crossings.every((r: any) => r.recoveryReceived === 30)).toBe(true);
    expect(crossings.every((r: any) => r.recoveryDeficit === 90)).toBe(true);
  });
});
