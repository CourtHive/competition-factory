import { analyzeParticipantRest } from '@Query/matchUps/scheduling/getParticipantRest';
import { describe, expect, it } from 'vitest';

// types
import { HydratedMatchUp } from '@Types/hydrated';

// constants
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';

/**
 * An unfinished matchUp nobody has called or started is placed in time by its schedule alone. It is under way
 * only if it holds a court (CA: a player on no grid cell is not on court), and it counts as load before the
 * inspected matchUp only if it is scheduled before it.
 *
 * Reported from production (2026-10-11): two players finished their R32s at
 * 15:33 and 15:53, and were waiting for a doubles quarterfinal scheduled 14:30. Their R16 singles, scheduled
 * 15:30, had not been called and were on no court. Rest read each R16 as under way from its scheduled time and
 * showed both players "On court now — ready 18:00". CA chose schedule order, then added the court rule; the
 * scheduled-time fallback stays for a matchUp on a court, which protects a venue that does not call matches.
 */

const DAY = '2026-10-11';
const FRAME = { utcOffsetMinutes: 0 };
const TIMING = { averageMinutes: 150, recoveryMinutes: 60, typeChangeRecoveryMinutes: 30 };
const at = (clock: string) => Date.parse(`${DAY}T${clock}:00.000Z`);
const iso = (clock: string) => `${DAY}T${clock}:00.000Z`;

function singles(id: string, participantIds: string[], schedule: any, extra: any = {}): HydratedMatchUp {
  return {
    matchUpId: id,
    matchUpType: SINGLES_MATCHUP,
    sides: participantIds.map((participantId) => ({ participantId, participantName: participantId })),
    schedule: { scheduledDate: DAY, ...schedule },
    ...extra,
  } as any;
}

function rowFor(matchUps: HydratedMatchUp[], target: string, asOf: string, participantId: string) {
  const result = analyzeParticipantRest({
    timingFor: () => TIMING,
    scheduledDate: DAY,
    asOfMs: at(asOf),
    frame: FRAME,
    matchUps,
    matchUpId: target,
  });
  if (!result.evaluated) throw new Error(`expected evaluation, got ${result.reason}`);
  return result.rows.find((row) => row.participantId === participantId);
}

// the reported day for one player: an R32 finished, an R16 scheduled after the match being inspected
const r32 = singles(
  'r32',
  ['playerA', 'playerB'],
  { scheduledTime: '13:30', scoredTime: iso('15:33') },
  { winningSide: 1 },
);
const target = singles('qf', ['playerA', 'playerC'], { scheduledTime: '14:30' });
const r16 = (schedule: any) => singles('r16', ['playerA', 'playerD'], schedule);

const COURT = { courtId: 'court-12' };

describe('an unfinished matchUp nobody has called or started', () => {
  it('on no court, it is not "on court": rest runs from the last finish (the reported case, exactly)', () => {
    const playerA = rowFor([r32, r16({ scheduledTime: '15:30' }), target], 'qf', '16:45', 'playerA');
    expect(playerA?.status).not.toEqual('onCourt');
    expect(playerA).toMatchObject({ source: 'scoredTime', restMinutes: 72 });
  });

  it('on no court, it is not "on court" even when scheduled before the inspected matchUp', () => {
    const playerA = rowFor([r32, r16({ scheduledTime: '14:00' }), target], 'qf', '16:45', 'playerA');
    expect(playerA?.status).not.toEqual('onCourt');
  });

  it('on a court but scheduled after the inspected matchUp, it is not load before it', () => {
    const playerA = rowFor([r32, r16({ scheduledTime: '15:30', ...COURT }), target], 'qf', '16:45', 'playerA');
    expect(playerA?.status).not.toEqual('onCourt');
  });

  it('on a court at the same time as the inspected matchUp, it does not count either', () => {
    const playerA = rowFor([r32, r16({ scheduledTime: '14:30', ...COURT }), target], 'qf', '16:45', 'playerA');
    expect(playerA?.status).not.toEqual('onCourt');
  });

  it('CONTROL: on a court, scheduled before the inspected matchUp and past its time, it reads "on court"', () => {
    const playerA = rowFor([r32, r16({ scheduledTime: '14:00', ...COURT }), target], 'qf', '16:45', 'playerA');
    expect(playerA?.status).toEqual('onCourt');
  });

  it('CONTROL: called to court, it counts whatever its court or scheduled time', () => {
    const playerA = rowFor(
      [r32, r16({ scheduledTime: '15:30', calledAt: iso('16:00') }), target],
      'qf',
      '16:45',
      'playerA',
    );
    expect(playerA?.status).toEqual('onCourt');
  });

  it('CONTROL: started, it counts whatever its court or scheduled time', () => {
    const playerA = rowFor(
      [r32, r16({ scheduledTime: '15:30', startTime: '16:05' }), target],
      'qf',
      '16:45',
      'playerA',
    );
    expect(playerA?.status).toEqual('onCourt');
  });

  it('CONTROL: on a court, when the inspected matchUp has no scheduled time to order them, it counts', () => {
    const untimed = singles('qf', ['playerA', 'playerC'], {});
    const playerA = rowFor([r32, r16({ scheduledTime: '15:30', ...COURT }), untimed], 'qf', '16:45', 'playerA');
    expect(playerA?.status).toEqual('onCourt');
  });
});
