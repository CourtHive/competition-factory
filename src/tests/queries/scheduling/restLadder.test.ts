import {
  analyzeParticipantRest,
  normalizeTimes,
  occursOnDay,
  resolveAnchors,
} from '@Query/matchUps/scheduling/getParticipantRest';
import { describe, expect, it } from 'vitest';

// constants and types
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * The ladder and the honesty rules, exercised directly against the pure
 * analysis rather than through the engine.
 *
 * These are the paths a tournament fixture cannot reach on demand: a score
 * stamped a day after the match, an anchor that sits in the future, a match
 * that has overrun its format's average. Each is a rule about *not* reporting a
 * number as measured when it is not, and each has to be provoked deliberately.
 *
 * Ported from the suite that guarded this analysis in TMX, restated in UTC
 * milliseconds — the frame the factory version works in.
 */

const DAY = '2026-09-12';
const FRAME = { utcOffsetMinutes: 0 };
const TIMING = { averageMinutes: 90, recoveryMinutes: 60, typeChangeRecoveryMinutes: 30 };
const at = (clock: string) => Date.parse(`${DAY}T${clock}:00.000Z`);

function singles(id: string, participantIds: string[], schedule: any, extra: any = {}): HydratedMatchUp {
  return {
    matchUpId: id,
    matchUpType: 'SINGLES',
    sides: participantIds.map((participantId) => ({ participantId, participantName: participantId })),
    schedule: { scheduledDate: DAY, ...schedule },
    ...extra,
  } as any;
}

function analyze(matchUps: HydratedMatchUp[], matchUpId: string, asOf: string, dailyLimits?: any) {
  const result = analyzeParticipantRest({
    timingFor: () => TIMING,
    scheduledDate: DAY,
    asOfMs: at(asOf),
    frame: FRAME,
    dailyLimits,
    matchUps,
    matchUpId,
  });
  if (!result.evaluated) throw new Error(`expected evaluation, got ${result.reason}`);
  return result;
}

describe('the ladder reports which rung it read, and what it passed over', () => {
  const prior = (schedule: any) => singles('prior', ['alice', 'bob'], schedule, { winningSide: 1 });
  const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });

  it('prefers a recorded end time over every projection', () => {
    const rows = analyze([prior({ scheduledTime: '09:00', endTime: '10:20' }), target], 'target', '12:00').rows;
    const alice = rows.find((row) => row.participantId === 'alice');
    expect(alice).toMatchObject({ source: 'endTime', restMinutes: 100, status: 'rested' });
    expect(alice?.discardedSources).toBeUndefined();
  });

  it('falls to the score stamp when no end time was recorded, and says the figure is that rung', () => {
    const rows = analyze(
      [prior({ scheduledTime: '09:00', scoredTime: `${DAY}T10:30:00.000Z` }), target],
      'target',
      '12:00',
    ).rows;
    expect(rows.find((row) => row.participantId === 'alice')).toMatchObject({
      source: 'scoredTime',
      restMinutes: 90,
    });
  });

  /**
   * A score entered the next morning is bookkeeping, not a finish. Reading it
   * as one would report a match that "ran" for eighteen hours; the rung is
   * rejected, the next one down is used, and the row NAMES the rejection so the
   * operator can see there is something wrong with the record.
   */
  it('rejects a finish stamped an implausible distance after its own start, and names the rung it dropped', () => {
    const rows = analyze(
      [prior({ scheduledTime: '09:00', scoredTime: `2026-09-13T08:00:00.000Z` }), target],
      'target',
      '12:00',
    ).rows;
    const alice = rows.find((row) => row.participantId === 'alice');
    // 09:00 + the 90-minute average, projected from the plan.
    expect(alice).toMatchObject({ source: 'scheduledTime', restMinutes: 90 });
    expect(alice?.discardedSources).toEqual(['scoredTime']);
  });

  it('accepts a finish with no start to contradict it', () => {
    // A score entered from a draw view leaves no scheduledTime and no
    // startTime. The stamp is then the only evidence the match happened.
    const undated = singles('prior', ['alice', 'bob'], { scoredTime: `${DAY}T10:30:00.000Z` }, { winningSide: 1 });
    const rows = analyze([undated, target], 'target', '12:00').rows;
    expect(rows.find((row) => row.participantId === 'alice')).toMatchObject({ source: 'scoredTime' });
  });

  /**
   * Every rung in the future means the match is recorded as finished but
   * nothing says when. Zero rest against a real requirement is the conservative
   * reading — it holds the player back — and the flag keeps that zero from
   * reading as a measurement.
   */
  it('reports an unreliable anchor rather than a measured zero', () => {
    const rows = analyze([prior({ scheduledTime: '16:00' }), target], 'target', '12:00').rows;
    const alice = rows.find((row) => row.participantId === 'alice');
    expect(alice).toMatchObject({ anchorUnreliable: true, restMinutes: 0, status: 'resting' });
    // No readyAt either: the clock time would be as fictional as the interval.
    expect(alice?.readyAt).toBeUndefined();
  });

  it('takes the latest usable anchor across several prior matchUps', () => {
    const early = singles('early', ['alice', 'x'], { scheduledTime: '08:00', endTime: '09:10' }, { winningSide: 1 });
    const late = singles('late', ['alice', 'y'], { scheduledTime: '10:00', endTime: '11:10' }, { winningSide: 1 });
    const rows = analyze([early, late, target], 'target', '12:00').rows;
    // Rest runs from the last time the player walked off, not the first.
    expect(rows.find((row) => row.participantId === 'alice')).toMatchObject({
      fromMatchUpId: 'late',
      restMinutes: 50,
    });
  });
});

describe('a participant on court is never given a rest figure', () => {
  const live = singles('live', ['alice', 'bob'], { scheduledTime: '11:30' });
  const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });

  it('projects a readyAt while the match is inside its expected window', () => {
    const rows = analyze([live, target], 'target', '12:00').rows;
    // 11:30 + 90 average = 13:00 projected finish, + 60 recovery.
    const alice = rows.find((row) => row.participantId === 'alice');
    expect(alice).toMatchObject({ status: 'onCourt', readyAt: '14:00' });
    expect(alice?.overrun).toBeUndefined();
    // No interval while the player is still out there.
    expect(alice?.restMinutes).toBeUndefined();
  });

  /**
   * Past the projected finish the estimate has expired with it. Naming a
   * readyAt in the past would read as though the player were already free,
   * which is exactly backwards.
   */
  it('withholds the readyAt once the match has overrun its format average', () => {
    const rows = analyze([live, target], 'target', '13:30').rows;
    const alice = rows.find((row) => row.participantId === 'alice');
    expect(alice).toMatchObject({ status: 'onCourt', overrun: true });
    expect(alice?.readyAt).toBeUndefined();
  });

  it('keeps counting a match that has run long as under way, rather than dropping it', () => {
    // Unbounded above on purpose: a match is over when a result says so, not
    // when the estimate expires. Six hours past the average, still live.
    const rows = analyze([live, target], 'target', '18:00').rows;
    expect(rows.find((row) => row.participantId === 'alice')?.status).toEqual('onCourt');
  });
});

describe('recovery owed, and the day’s load', () => {
  it('charges the singles ↔ doubles figure when the participant changes type', () => {
    const priorDoubles = {
      ...singles('prior', ['alice', 'bob'], { scheduledTime: '09:00', endTime: '10:20' }, { winningSide: 1 }),
      matchUpType: 'DOUBLES',
    } as HydratedMatchUp;
    const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });
    const rows = analyze([priorDoubles, target], 'target', '10:40').rows;
    expect(rows.find((row) => row.participantId === 'alice')).toMatchObject({
      requiredMinutes: 30,
      typeChange: true,
    });
  });

  it('reports the ordinal and flags the limit the matchUp would meet', () => {
    const first = singles('first', ['alice', 'x'], { scheduledTime: '08:00', endTime: '09:10' }, { winningSide: 1 });
    const second = singles('second', ['alice', 'y'], { scheduledTime: '10:00', endTime: '11:10' }, { winningSide: 1 });
    const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });
    const rows = analyze([first, second, target], 'target', '13:00', { SINGLES: 3, total: 3 }).rows;
    const alice = rows.find((row) => row.participantId === 'alice');
    expect(alice?.load).toMatchObject({ ordinal: 3, singles: 2, total: 2, limit: 3 });
    expect(alice?.load.atLimit).toEqual(['total', 'singles']);
  });

  it('reports no limits at all when no scheduling policy declares any', () => {
    const prior = singles('prior', ['alice', 'x'], { scheduledTime: '08:00', endTime: '09:10' }, { winningSide: 1 });
    const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });
    const rows = analyze([prior, target], 'target', '13:00').rows;
    expect(rows.find((row) => row.participantId === 'alice')?.load.atLimit).toEqual([]);
  });

  /**
   * Sorting by status alone let side order decide which player a headline spoke
   * for, so a doubles pair resting at 10m and 40m reported whichever happened
   * to be listed first. Within a band the furthest from ready wins.
   */
  it('orders rows worst-first, and breaks a tie inside a band by shortfall', () => {
    const aliceRest = singles('a', ['alice', 'x'], { scheduledTime: '10:00', endTime: '11:40' }, { winningSide: 1 });
    const chenRest = singles('c', ['chen', 'y'], { scheduledTime: '10:00', endTime: '11:00' }, { winningSide: 1 });
    const target = singles('target', ['alice', 'chen'], { scheduledTime: '14:00' });
    const rows = analyze([aliceRest, chenRest, target], 'target', '12:00').rows;
    // Alice has had 20 minutes of her 60, Chen 60 of 60 — Alice is the headline.
    expect(rows.map((row) => row.participantId)).toEqual(['alice', 'chen']);
    expect(rows[0].status).toEqual('resting');
    expect(rows[1].status).toEqual('rested');
  });
});

describe('which matchUps belong to the day being measured', () => {
  it('dates an undated matchUp by the venue calendar day of its score stamp', () => {
    const undated = singles('undated', ['alice'], {}, {});
    const times = normalizeTimes({ ...undated, schedule: { scoredTime: `${DAY}T10:30:00.000Z` } } as any, FRAME);
    expect(occursOnDay({ ...undated, schedule: { scoredTime: `${DAY}T10:30:00.000Z` } } as any, times, DAY)).toEqual(
      true,
    );
  });

  it('excludes a matchUp that carries neither a scheduled date nor a score stamp', () => {
    const orphan = singles('orphan', ['alice'], {}, {});
    const times = normalizeTimes({ ...orphan, schedule: {} } as any, FRAME);
    expect(occursOnDay({ ...orphan, schedule: {} } as any, times, DAY)).toEqual(false);
  });

  it('reads an end time that crossed midnight against the day it was recorded on', () => {
    const overnight = singles(
      'overnight',
      ['alice'],
      { scheduledTime: '22:30', endTime: '00:40', endDate: '2026-09-13' },
      { winningSide: 1 },
    );
    const anchors = resolveAnchors(normalizeTimes(overnight, FRAME), TIMING);
    // 00:40 on the following day, not 00:40 on the day it started.
    expect(anchors[0]).toMatchObject({ source: 'endTime', ms: Date.parse('2026-09-13T00:40:00.000Z') });
  });
});

describe('rest declines to evaluate what it cannot', () => {
  it('reports noParticipants for a matchUp whose sides are still empty', () => {
    const empty = { matchUpId: 'empty', sides: [{}, {}], schedule: { scheduledDate: DAY } } as any;
    const result = analyzeParticipantRest({
      timingFor: () => TIMING,
      matchUps: [empty],
      matchUpId: 'empty',
      scheduledDate: DAY,
      asOfMs: at('12:00'),
      frame: FRAME,
    });
    expect(result).toEqual({ evaluated: false, reason: 'noParticipants' });
  });

  it('reports bye rather than measuring a matchUp nobody plays', () => {
    const bye = singles('bye', ['alice'], { scheduledTime: '09:00' }, { matchUpStatus: 'BYE' });
    const result = analyzeParticipantRest({
      timingFor: () => TIMING,
      matchUps: [bye],
      matchUpId: 'bye',
      scheduledDate: DAY,
      asOfMs: at('12:00'),
      frame: FRAME,
    });
    expect(result).toEqual({ evaluated: false, reason: 'bye' });
  });
});
