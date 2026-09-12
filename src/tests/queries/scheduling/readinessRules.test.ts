import {
  analyzeMatchUpReadiness,
  individualIds,
  matchUpLabel,
  minutesToClock,
  nameFor,
  parseClockMinutes,
} from '@Query/matchUps/scheduling/getMatchUpReadiness';
import { describe, expect, it } from 'vitest';

// constants and types
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
