import { describe, expect, it } from 'vitest';
import {
  analyzeMatchUpReadiness,
  individualIds,
  matchUpLabel,
  minutesToClock,
  nameFor,
  parseClockMinutes,
} from '@Query/matchUps/scheduling/getMatchUpReadiness';

// types
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * The readiness rules that a tournament fixture cannot provoke on demand: a
 * recovery window that has not elapsed, a neighbour with a recorded end time, a
 * doubles pair sharing one player with the target, and the projection refusals.
 *
 * Exercised against the pure analysis, which is what the query calls once it has
 * resolved matchUps and timing.
 */

const DAY = '2026-09-12';
const TIMING = { averageMinutes: 90, recoveryMinutes: 60, typeChangeRecoveryMinutes: 30 };

function matchUp(id: string, sides: any[], schedule: any, extra: any = {}): HydratedMatchUp {
  return {
    matchUpId: id,
    matchUpType: 'SINGLES',
    sides,
    schedule: { scheduledDate: DAY, ...schedule },
    ...extra,
  } as any;
}

const player = (participantId: string) => ({ participantId, participantName: participantId });

function analyze(matchUps: HydratedMatchUp[], matchUpId: string) {
  const result = analyzeMatchUpReadiness({ matchUps, matchUpId, timingFor: () => TIMING });
  if (!result.evaluated) throw new Error(`expected evaluation, got ${result.reason}`);
  return result.findings;
}

describe('what the schedule actually commits to', () => {
  const earlier = () =>
    matchUp(
      'earlier',
      [player('alice'), player('bob')],
      { scheduledTime: '09:00', endTime: '10:45' },
      { winningSide: 1 },
    );

  it('reports a firm time as firm, and grades against it', () => {
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    const result = analyzeMatchUpReadiness({
      matchUps: [earlier(), target],
      matchUpId: 'target',
      timingFor: () => TIMING,
    });
    expect(result).toMatchObject({ evaluated: true, commitment: 'firm' });
    expect((result as any).findings[0]).toMatchObject({ kind: 'recovery', severity: 'WARN', notBefore: '11:45' });
  });

  it('does not evaluate a time the schedule withdrew', () => {
    // `TO_BE_ANNOUNCED` and its kin clear `scheduledTime` on write, so a record
    // carrying both is legacy or hand-written — and the annotation is the more
    // recent statement of intent. Grading it would report the matchUp as unable
    // to meet a time nobody claimed.
    const target = matchUp('target', [player('alice'), player('chen')], {
      scheduledTime: '11:00',
      timeModifiers: ['TO_BE_ANNOUNCED'],
    });
    const result = analyzeMatchUpReadiness({
      matchUps: [earlier(), target],
      matchUpId: 'target',
      timingFor: () => TIMING,
    });
    expect(result).toEqual({ evaluated: false, reason: 'timeNotPromised' });
  });

  it('demotes findings against a NOT_BEFORE floor, keeping their times', () => {
    // "No earlier than 11:00" permits a later start, so a window clearing at
    // 11:45 is a later floor rather than a broken promise. The sentence and the
    // clock survive; only the severity moves.
    const target = matchUp('target', [player('alice'), player('chen')], {
      scheduledTime: '11:00',
      timeModifiers: ['NOT_BEFORE'],
    });
    const result: any = analyzeMatchUpReadiness({
      matchUps: [earlier(), target],
      matchUpId: 'target',
      timingFor: () => TIMING,
    });
    expect(result).toMatchObject({ evaluated: true, commitment: 'floor' });
    expect(result.findings[0]).toMatchObject({ kind: 'recovery', severity: 'INFO', notBefore: '11:45' });
  });

  it('never demotes an overlap — a body on a court is not a promise', () => {
    const live = matchUp('live', [player('alice'), player('dee')], { scheduledTime: '10:30' });
    const target = matchUp('target', [player('alice'), player('chen')], {
      scheduledTime: '11:00',
      timeModifiers: ['NOT_BEFORE'],
    });
    const result: any = analyzeMatchUpReadiness({
      matchUps: [live, target],
      matchUpId: 'target',
      timingFor: () => TIMING,
    });
    expect(result.findings.find((finding: any) => finding.kind === 'overlap')).toMatchObject({ severity: 'WARN' });
  });
});

describe('recovery — the window that has not elapsed', () => {
  it('reports the participant and the clock the window clears, projected from the plan', () => {
    const earlier = matchUp('earlier', [player('alice'), player('bob')], { scheduledTime: '09:00' });
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    const [finding] = analyze([earlier, target], 'target');
    // 09:00 + 90 average + 60 recovery = 11:30, after the 11:00 start.
    expect(finding).toMatchObject({ kind: 'recovery', severity: 'WARN', notBefore: '11:30' });
    expect(finding.participantIds).toEqual(['alice']);
  });

  it('prefers a recorded end time over the projection when measuring the window', () => {
    const earlier = matchUp(
      'earlier',
      [player('alice'), player('bob')],
      { scheduledTime: '09:00', endTime: '10:45' },
      { winningSide: 1 },
    );
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    // 10:45 + 60 recovery = 11:45, measured rather than projected.
    expect(analyze([earlier, target], 'target')[0]).toMatchObject({ notBefore: '11:45' });
  });

  it('measures from when the earlier matchUp ACTUALLY started, not from when it was planned', () => {
    // The rung the ladder used to skip. A match that went on forty minutes late
    // carries the evidence in `startTime`; projecting from the plan instead
    // frees the player earlier than they will be.
    const earlier = matchUp('earlier', [player('alice'), player('bob')], {
      scheduledTime: '09:00',
      startTime: '09:40',
    });
    // 11:30, not 11:00: started at 09:40 the match is projected on court until 11:10, so an
    // 11:00 start is an OVERLAP (see "overlap dates a neighbour by when it actually went on").
    // This fixture pinned `recovery` at 11:00 only because the overlap test read the plan.
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:30' });
    // 09:40 + 90 average + 60 recovery = 12:10.
    expect(analyze([earlier, target], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '12:10' });
  });

  it('says nothing when the window has already elapsed', () => {
    const earlier = matchUp(
      'earlier',
      [player('alice'), player('bob')],
      { scheduledTime: '08:00', endTime: '09:20' },
      { winningSide: 1 },
    );
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '14:00' });
    expect(analyze([earlier, target], 'target')).toEqual([]);
  });

  it('says nothing about a neighbour on another day', () => {
    const yesterday = matchUp('yesterday', [player('alice'), player('bob')], {
      scheduledDate: '2026-09-11',
      scheduledTime: '20:00',
    });
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:00' });
    expect(analyze([yesterday, target], 'target')).toEqual([]);
  });

  it('reaches the members of a doubles pair, not just the pair itself', () => {
    const pair = {
      participantId: 'pair-1',
      participant: {
        participantId: 'pair-1',
        participantName: 'Alice/Bob',
        individualParticipantIds: ['alice', 'bob'],
      },
    };
    const doubles = matchUp('doubles', [pair, player('other')], { scheduledTime: '09:00' });
    // 11:00 is past the pair's projected 10:30 finish, so this is the recovery
    // window rather than an overlap — the band that has to reach the members.
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    const [finding] = analyze([doubles, target], 'target');
    expect(finding.kind).toEqual('recovery');
    expect(finding.participantIds).toEqual(['alice']);
    // The label names the pair, because that is what is on court.
    expect(finding.participantNames).toEqual(['Alice/Bob']);
  });

  it('does not treat a finished neighbour as an overlap, only as recovery', () => {
    const finished = matchUp(
      'finished',
      [player('alice'), player('bob')],
      { scheduledTime: '10:30' },
      { winningSide: 1, matchUpStatus: 'COMPLETED' },
    );
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    const kinds = analyze([finished, target], 'target').map((finding) => finding.kind);
    expect(kinds).toEqual(['recovery']);
  });
});

describe('undetermined participants', () => {
  it('is silent when a side is empty but nothing upstream explains it', () => {
    const target = matchUp('target', [player('alice'), {}], { scheduledTime: '11:00' });
    expect(analyze([target], 'target')).toEqual([]);
  });

  it('projects a dependency from the same ladder the recovery window uses', () => {
    // These were two ladders over one matchUp: the dependency read only the
    // plan while the recovery window preferred a recorded end. A consumer
    // showing both figures for one upstream got two anchors presented as one
    // calculation.
    const feeder = matchUp('feeder', [player('alice'), player('bob')], {
      scheduledTime: '14:00',
      startTime: '14:40',
    });
    const target = matchUp('target', [{}, player('chen')], { scheduledTime: '14:30' }, {});
    (feeder as any).winnerMatchUpId = 'target';
    // 14:40 + 90 = 16:10, against a plan-only projection of 15:30.
    const dependency = analyze([feeder, target], 'target').find((finding) => finding.kind === 'dependency');
    expect(dependency).toMatchObject({ notBefore: '16:10' });
  });

  it('prefers a recorded end over a start when projecting a dependency', () => {
    const feeder = matchUp('feeder', [player('alice'), player('bob')], {
      scheduledTime: '14:00',
      startTime: '14:40',
      endTime: '15:05',
    });
    const target = matchUp('target', [{}, player('chen')], { scheduledTime: '14:30' });
    (feeder as any).winnerMatchUpId = 'target';
    const dependency = analyze([feeder, target], 'target').find((finding) => finding.kind === 'dependency');
    expect(dependency).toMatchObject({ notBefore: '15:05' });
  });

  it('walks past a finished feeder to report the grandparent that is still pending', () => {
    const grandparent = matchUp('grand', [player('x'), player('y')], { scheduledTime: '09:00' });
    const parent = matchUp(
      'parent',
      [player('x'), player('z')],
      { scheduledTime: '10:00' },
      {
        winnerMatchUpId: 'target',
      },
    );
    const linkedGrand = { ...grandparent, winnerMatchUpId: 'parent' } as HydratedMatchUp;
    const target = matchUp('target', [{}, {}], { scheduledTime: '15:00' });
    const undetermined = analyze([linkedGrand, parent, target], 'target').find(
      (finding) => finding.kind === 'undetermined',
    );
    expect(undetermined?.matchUpIds).toEqual(expect.arrayContaining(['parent', 'grand']));
  });
});

/**
 * A dependency's `notBefore` is when the upstream match frees the COURT; `readyAt` is when
 * its winner could be on this one, recovery included. Ported from TMX #1459, which the TMX
 * copy of this analysis carried and this one did not.
 */
describe('a dependency carries the court-free time AND when the winner could start', () => {
  const target = (sides: any[]) => matchUp('target', sides, { scheduledTime: '10:00' });
  const feeder = () =>
    matchUp('feeder', [player('alice'), player('bob')], { scheduledTime: '09:00' }, { winnerMatchUpId: 'target' });

  it('reports both figures, and the second is the first plus recovery', () => {
    const [finding] = analyze([feeder(), target([{}, player('chen')])], 'target');
    // 09:00 + 90 = 10:30 court-free; + 60 recovery = 11:30
    expect(finding).toMatchObject({ kind: 'dependency', notBefore: '10:30', readyAt: '11:30' });
  });

  it('carries no second figure when recovery adds nothing', () => {
    const findings = analyzeMatchUpReadiness({
      matchUps: [feeder(), target([{}, player('chen')])],
      matchUpId: 'target',
      timingFor: () => ({ ...TIMING, recoveryMinutes: 0 }),
    });
    if (!findings.evaluated) throw new Error('expected evaluation');
    expect(findings.findings[0]).toMatchObject({ kind: 'dependency', notBefore: '10:30' });
    expect(findings.findings[0].readyAt).toBeUndefined();
  });

  it('gives a recovery finding no second figure: its time is already recovery-inclusive', () => {
    const earlier = matchUp('earlier', [player('alice'), player('bob')], { scheduledTime: '09:00' });
    const later = matchUp('later', [player('alice'), player('chen')], { scheduledTime: '11:00' });
    const [finding] = analyze([earlier, later], 'later');
    expect(finding.kind).toEqual('recovery');
    expect(finding.readyAt).toBeUndefined();
  });
});

describe('the small shared helpers', () => {
  it('parses a wall clock and refuses what is not one', () => {
    expect(parseClockMinutes('09:30')).toEqual(570);
    expect(parseClockMinutes('24:00')).toBeNull();
    expect(parseClockMinutes('9:5')).toBeNull();
    expect(parseClockMinutes(undefined)).toBeNull();
  });

  it('wraps a projected clock past midnight rather than reporting a 25th hour', () => {
    expect(minutesToClock(540)).toEqual('09:00');
    expect(minutesToClock(1500)).toEqual('01:00');
    expect(minutesToClock(-30)).toEqual('23:30');
  });

  it('labels a matchUp by its round and its sides, and copes when neither is known', () => {
    expect(matchUpLabel(matchUp('m', [player('alice'), player('bob')], {}, { roundName: 'R16' }))).toEqual(
      'R16: alice vs bob',
    );
    expect(matchUpLabel({ matchUpId: 'm' } as any)).toEqual('TBD vs TBD');
  });

  it('counts a pair once, by its members, never as itself as well', () => {
    const pair = {
      participantId: 'pair-1',
      participant: { participantId: 'pair-1', individualParticipantIds: ['alice', 'bob'] },
    };
    expect(individualIds(matchUp('m', [pair, player('chen')], {}))).toEqual(['alice', 'bob', 'chen']);
  });

  it('falls back to the participantId when no side carries a name for it', () => {
    expect(nameFor('ghost', [matchUp('m', [player('alice')], {})])).toEqual('ghost');
  });
});

/**
 * Recovery is time owed for a match already BEGUN, so the rule is directional —
 * and nothing enforced that. Ordering was consulted only by the overlap test, so
 * every same-day neighbour scheduled later fell through to the recovery
 * arithmetic and had its projected finish charged against a matchUp hours
 * earlier. Reported against the TMX copy of this analysis on 2026-09-27: a 09:30
 * singles read "needs recovery time — not before 16:30" off the player's 14:30
 * doubles, four lines under a rest section correctly saying she had not played
 * yet.
 *
 * The first two cases are one fixture graded from both ends. Asserting only the
 * silence would also pass with the recovery branch deleted.
 */
describe('recovery is owed only by a match already begun', () => {
  // alice plays at 09:00 and again at 11:00. 09:00 + 90 = 10:30, so 11:00 is
  // clear of the playing window but inside the 60-minute recovery that follows.
  const early = () => matchUp('early', [player('alice'), player('bob')], { scheduledTime: '09:00' });
  const late = () => matchUp('late', [player('alice'), player('chen')], { scheduledTime: '11:00' });

  it('charges the later matchUp for the earlier one', () => {
    const [finding] = analyze([early(), late()], 'late');
    expect(finding).toMatchObject({ kind: 'recovery', notBefore: '11:30' });
    expect(finding.participantIds).toEqual(['alice']);
  });

  it('charges the earlier matchUp nothing for the later one', () => {
    expect(analyze([early(), late()], 'early')).toEqual([]);
  });

  it('says nothing about a doubles semifinal hours later — the reported case', () => {
    const pair = {
      participantId: 'pair-1',
      participant: { participantId: 'pair-1', participantName: 'Alice/Stauber', individualParticipantIds: ['alice'] },
    };
    const singles = matchUp('r16', [player('alice'), player('chen')], { scheduledTime: '09:30' });
    const doubles = matchUp('dsf', [pair, player('other')], { scheduledTime: '14:30' }, { matchUpType: 'DOUBLES' });
    expect(analyze([singles, doubles], 'r16')).toEqual([]);
  });

  /**
   * The gate reads `startTime` before `scheduledTime` — `finishOf`'s order of
   * authority — so it cannot excuse a neighbour that went on EARLY. Suppressing
   * by the plan would hide a live clash, a worse failure than the one fixed.
   */
  it('still charges a neighbour planned later that in fact started earlier', () => {
    const planned = matchUp('planned', [player('alice'), player('bob')], {
      scheduledTime: '10:30',
      startTime: '08:00',
    });
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:45' });
    // On court at 08:00 → finishes 09:30, free 10:30, past the 09:45 start.
    expect(analyze([planned, target], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '10:30' });
  });

  /**
   * A recorded `endTime` is the gate's last rung, and the only thing that dates a
   * matchUp scheduled for the day with no time on it. Without it such a neighbour
   * has no anchor at all and is charged for exactly as before.
   */
  it('dates a neighbour by its recorded end time when it carries no other clock', () => {
    const later = matchUp('later', [player('alice'), player('bob')], { endTime: '14:00' }, { winningSide: 1 });
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:00' });
    expect(analyze([later, target], 'target')).toEqual([]);
  });

  /**
   * Scheduled for the day with no clock of any kind on it. Nothing dates it, so
   * the gate cannot place it and the projection below cannot price it — the
   * neighbour is reported by neither branch rather than guessed at.
   */
  it('says nothing about a neighbour with a date but no clock at all', () => {
    const undated = matchUp('undated', [player('alice'), player('bob')], {});
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:00' });
    expect(analyze([undated, target], 'target')).toEqual([]);
  });

  it('charges the same neighbour when that end time is behind the start — the control', () => {
    const earlier = matchUp('earlier', [player('alice'), player('bob')], { endTime: '08:30' }, { winningSide: 1 });
    const target = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:00' });
    expect(analyze([earlier, target], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '09:30' });
  });
});

/**
 * Every case above grades a target with ONE neighbour: a later one the gate must
 * now skip, or an earlier one it must still charge. A player's day is earlier
 * match, this match, later match, so the reported arrangement is both at once —
 * the target sits BETWEEN a neighbour that can owe recovery and one that cannot.
 *
 * The gate is an exit from the ITERATION. Rewritten as an exit from the PASS it
 * would satisfy every case above and go silent on the earlier neighbour that
 * genuinely owes, which is the worse direction to fail in: a suppressed true
 * finding rather than the false one the gate removed.
 *
 * `Battle of Boca`, prod 2026-09-27, the second report off this defect. A 13:30
 * singles quarterfinal read "needs recovery time — not before 16:30" off the
 * player's 14:30 doubles, directly under a rest section correctly reading
 * "1h 54m rested" from her 09:30 R16. Her opponent, in no doubles draw, drew no
 * finding from an identical singles day — which is what identified the later
 * matchUp as the source.
 */
describe('a target between an earlier and a later neighbour', () => {
  const target = () => matchUp('target', [player('alice'), player('chen')], { scheduledTime: '13:30' });
  /** Finished, and far enough back that its recovery has expired: 09:30 + 90 + 60 = 12:00. */
  const spent = () =>
    matchUp('earlier', [player('alice'), player('bob')], { scheduledTime: '09:30' }, { winningSide: 1 });
  /** Finished, and recent enough to still owe: 12:30 + 90 + 60 = 15:00. */
  const owing = () =>
    matchUp('earlier', [player('alice'), player('bob')], { scheduledTime: '12:30' }, { winningSide: 1 });
  /** Not played, and after the target — the neighbour the gate exists for. */
  const later = () => {
    const pair = {
      participantId: 'pair-1',
      participant: { participantId: 'pair-1', participantName: 'Alice/Stauber', individualParticipantIds: ['alice'] },
    };
    return matchUp('later', [pair, player('other')], { scheduledTime: '14:30' }, { matchUpType: 'DOUBLES' });
  };

  it('says nothing when the earlier neighbour is spent and the later one is only planned', () => {
    expect(analyze([spent(), target(), later()], 'target')).toEqual([]);
  });

  it('still charges the earlier neighbour that owes, and names only it', () => {
    const findings = analyze([owing(), target(), later()], 'target');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'recovery', notBefore: '15:00' });
    expect(findings[0].matchUpIds).toEqual(['earlier']);
  });

  it('puts the clash on the later matchUp, where the target is the thing in the way', () => {
    // 13:30 + 90 = 15:00, so the target's playing window contains the 14:30 start.
    const findings = analyze([spent(), target(), later()], 'later');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'overlap' });
    expect(findings[0].matchUpIds).toEqual(['target']);
    expect(findings[0].participantIds).toEqual(['alice']);
  });
});

/**
 * The overlap test asks whether the neighbour is ON COURT at this start time, so it
 * must date the neighbour by when it actually went on. It read only `scheduledTime`,
 * while `finishOf` and the recovery gate read `startTime` first: a neighbour planned
 * for 08:00 that went on at 10:00 is on court at 10:15, and was reported as
 * `recovery` — the right clock, the wrong kind, about a player who is mid-match.
 * Each case is paired with the same fixture minus the `startTime`, which is what
 * the old anchor saw.
 */
describe('overlap dates a neighbour by when it actually went on', () => {
  const target = () => matchUp('target', [player('alice'), player('chen')], { scheduledTime: '10:15' });

  it('reports a neighbour that went on late, and is still on court, as an overlap', () => {
    const late = matchUp('late', [player('alice'), player('bob')], { scheduledTime: '08:00', startTime: '10:00' });
    const findings = analyze([late, target()], 'target');
    expect(findings.map((finding) => finding.kind)).toEqual(['overlap']);
    expect(findings[0].participantIds).toEqual(['alice']);
  });

  it('reports the same neighbour by its plan when no start was recorded — the control', () => {
    // 08:00 + 90 = 09:30, so 10:15 is past the playing window but inside the recovery that follows.
    const planned = matchUp('planned', [player('alice'), player('bob')], { scheduledTime: '08:00' });
    expect(analyze([planned, target()], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '10:30' });
  });

  it('reports a neighbour that went on early, and is on court at this start, as an overlap', () => {
    const early = matchUp('early', [player('alice'), player('bob')], { scheduledTime: '10:00', startTime: '08:00' });
    const at0900 = matchUp('target', [player('alice'), player('chen')], { scheduledTime: '09:00' });
    expect(analyze([early, at0900], 'target').map((finding) => finding.kind)).toEqual(['overlap']);
  });
});

/**
 * Recovery is time owed for a match that put its players on court. A walkover put
 * nobody there, yet `isFinished` counts it, so an earlier walkover projected a full
 * recovery window. `getParticipantRest` and the Participant Recovery report already
 * skip such a matchUp through `wasPlayed`; readiness was the only one of the three
 * without it. The same predicate stops a CANCELLED neighbour — which `isFinished`
 * does not count — from being read as an overlap.
 */
describe('a matchUp nobody played owes nothing', () => {
  const target = () => matchUp('target', [player('alice'), player('chen')], { scheduledTime: '11:00' });
  const at0900 = (extra: any) =>
    matchUp('earlier', [player('alice'), player('bob')], { scheduledTime: '09:00' }, extra);

  it('charges no recovery for an earlier walkover', () => {
    expect(analyze([at0900({ matchUpStatus: 'WALKOVER', winningSide: 1 }), target()], 'target')).toEqual([]);
  });

  it('charges no recovery for an earlier double walkover', () => {
    expect(analyze([at0900({ matchUpStatus: 'DOUBLE_WALKOVER' }), target()], 'target')).toEqual([]);
  });

  it('charges recovery for the same matchUp when it was played — the control', () => {
    const played = at0900({ matchUpStatus: 'COMPLETED', winningSide: 1 });
    expect(analyze([played, target()], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '11:30' });
  });

  it('charges recovery for a default with a score, which was played up to the default', () => {
    const defaulted = at0900({ matchUpStatus: 'DEFAULTED', winningSide: 1, score: { sets: [{ side1Score: 3 }] } });
    expect(analyze([defaulted, target()], 'target')[0]).toMatchObject({ kind: 'recovery', notBefore: '11:30' });
  });

  it('charges no recovery for a default with no score, which is a no-show', () => {
    expect(analyze([at0900({ matchUpStatus: 'DEFAULTED', winningSide: 1 }), target()], 'target')).toEqual([]);
  });

  it('does not read a cancelled neighbour as an overlap', () => {
    const cancelled = matchUp(
      'cancelled',
      [player('alice'), player('bob')],
      { scheduledTime: '10:30' },
      {
        matchUpStatus: 'CANCELLED',
      },
    );
    expect(analyze([cancelled, target()], 'target')).toEqual([]);
  });

  it('reads the same neighbour as an overlap when it stands — the control', () => {
    const standing = matchUp('standing', [player('alice'), player('bob')], { scheduledTime: '10:30' });
    expect(analyze([standing, target()], 'target').map((finding) => finding.kind)).toEqual(['overlap']);
  });
});
