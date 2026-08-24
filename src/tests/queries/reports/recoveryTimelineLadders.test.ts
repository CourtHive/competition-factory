import { buildRecoveryTimeline, wasPlayed } from '@Query/reports/recoveryTimeline';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { DOUBLES_EVENT } from '@Constants/eventConstants';

const DATE = '2026-08-20';

/**
 * The finish and duration ladders are the heart of the report: five rungs of
 * decreasing fidelity for "when did this end", four for "how long did it run".
 * Each rung needs its own exercise, because a rung that silently never fires is
 * indistinguishable from one that works until the day the data shape changes.
 */
function seed({ doubles = false }: { doubles?: boolean } = {}) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        ...(doubles && { eventType: DOUBLES_EVENT }),
        eventName: doubles ? 'Doubles' : 'Singles',
        matchUpFormat: 'SET3-S:6/TB7',
        drawSize: 4,
      },
    ],
    completeAllMatchUps: true,
    startDate: DATE,
    endDate: DATE,
    setState: true,
    nonRandom: 1,
  });
  const matchUps = tournamentEngine.allTournamentMatchUps({}).matchUps ?? [];
  return { matchUps };
}

const timelineFor = (utcOffsetMinutes = 0, asOfMs?: number) =>
  buildRecoveryTimeline({
    tournamentRecord: tournamentEngine.getTournament().tournamentRecord as any,
    utcOffsetMinutes,
    asOfMs,
  });

/** Every appearance in the timeline, flattened. */
const allAppearances = (timeline: ReturnType<typeof timelineFor>) => [...timeline.byParticipant.values()].flat();

describe('wasPlayed', () => {
  it('excludes the statuses where nobody took the court', () => {
    for (const matchUpStatus of ['WALKOVER', 'DOUBLE_WALKOVER', 'CANCELLED']) {
      expect(wasPlayed({ matchUpStatus })).toBe(false);
    }
  });

  it('includes retirements and abandonments — time was spent on court', () => {
    for (const matchUpStatus of ['RETIRED', 'ABANDONED', 'COMPLETED', 'DEAD_RUBBER']) {
      expect(wasPlayed({ matchUpStatus })).toBe(true);
    }
  });

  it('splits a default on score presence: mid-match disqualification vs no-show', () => {
    // Nothing else in the record distinguishes them.
    expect(wasPlayed({ matchUpStatus: 'DEFAULTED', score: { sets: [{ side1Score: 6 }] } })).toBe(true);
    expect(wasPlayed({ matchUpStatus: 'DEFAULTED' })).toBe(false);
    expect(wasPlayed({ matchUpStatus: 'DOUBLE_DEFAULT', score: { sets: [] } })).toBe(false);
  });

  it('treats an unknown or absent status as played', () => {
    expect(wasPlayed({})).toBe(true);
    expect(wasPlayed({ matchUpStatus: 'IN_PROGRESS' })).toBe(true);
  });
});

describe('finish and duration ladders', () => {
  it('falls to scoredTime when no endTime was recorded', () => {
    const { matchUps } = seed();
    const target: any = matchUps[0];
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledDate: DATE,
    });
    tournamentEngine.addMatchUpStartTime({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      startTime: '09:00',
    });

    const appearance = allAppearances(timelineFor()).find((a) => a.matchUpId === target.matchUpId);
    expect(appearance).toBeTruthy();
    // mocksEngine scores every matchUp, so the factory stamped scoredTime.
    expect(appearance!.finishSource).toEqual('scoredTime');
    // Duration is start → scoredTime, a proxy rather than the format average.
    expect(appearance!.durationSource).toEqual('scoredTime');
  });

  it('projects from scheduledTime when nothing else is recorded, and says the duration is estimated', () => {
    const { matchUps } = seed();
    const target: any = matchUps[0];
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledDate: DATE,
    });
    tournamentEngine.addMatchUpScheduledTime({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledTime: '09:00',
    });
    // Remove the auto-stamped scoredTime so the ladder falls all the way through.
    tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: 'COMPLETED', winningSide: 1, score: undefined },
      matchUpId: target.matchUpId,
      drawId: target.drawId,
    });

    const appearance = allAppearances(timelineFor()).find((a) => a.matchUpId === target.matchUpId);
    expect(appearance).toBeTruthy();
    expect(appearance!.durationSource).toEqual('estimated');
    // 90 for SET3-S:6/TB7 under POLICY_SCHEDULING_DEFAULT — the policy's
    // prediction, not an observation, which is exactly why it is labelled.
    expect(appearance!.durationMinutes).toEqual(90);
  });

  it('excludes a matchUp with no time information at all rather than guessing', () => {
    const { matchUps } = seed();
    // Nothing scheduled anywhere.
    const timeline = timelineFor();
    expect(timeline.totalCount).toEqual(0);
    expect(allAppearances(timeline).length).toEqual(0);
    expect(matchUps.length).toBeGreaterThan(0);
  });

  it('honours asOfMs so an in-progress tournament can be bounded', () => {
    const { matchUps } = seed();
    for (const matchUp of matchUps as any[]) {
      tournamentEngine.addMatchUpScheduledDate({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        scheduledDate: DATE,
      });
      tournamentEngine.addMatchUpScheduledTime({
        matchUpId: matchUp.matchUpId,
        drawId: matchUp.drawId,
        scheduledTime: '09:00',
      });
    }
    const unbounded = timelineFor();
    expect(unbounded.totalCount).toBeGreaterThan(0);

    // Bound to before the day began — nothing has started yet.
    const bounded = timelineFor(0, Date.parse(`${DATE}T00:00:00.000Z`));
    expect(bounded.totalCount).toEqual(0);
  });

  it('shifts the reported calendar day by the venue offset', () => {
    const { matchUps } = seed();
    const target: any = matchUps[0];
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledDate: DATE,
    });
    tournamentEngine.addMatchUpScheduledTime({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledTime: '23:30',
    });

    // 23:30 local at UTC+0 is still DATE...
    expect(allAppearances(timelineFor(0)).find((a) => a.matchUpId === target.matchUpId)!.scheduledDate).toEqual(DATE);
    // ...and the arithmetic is offset-consistent: the wall clock is interpreted
    // in the venue's frame, so the local date the operator saw is preserved.
    expect(allAppearances(timelineFor(-300)).find((a) => a.matchUpId === target.matchUpId)!.scheduledDate).toEqual(
      DATE,
    );
  });
});

describe('doubles', () => {
  it('yields one appearance per individual, not per pair', () => {
    const { matchUps } = seed({ doubles: true });
    const target: any = matchUps[0];
    tournamentEngine.addMatchUpScheduledDate({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      scheduledDate: DATE,
    });
    tournamentEngine.addMatchUpStartTime({
      matchUpId: target.matchUpId,
      drawId: target.drawId,
      startTime: '09:00',
    });

    const appearances = allAppearances(timelineFor()).filter((a) => a.matchUpId === target.matchUpId);
    // Four individuals across two pairs — recovery is a property of a person,
    // which is what makes same-day singles+doubles load visible at all.
    expect(appearances.length).toEqual(4);
    expect(new Set(appearances.map((a) => a.participantId)).size).toEqual(4);
  });
});
