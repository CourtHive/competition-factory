/**
 * CODES Phase 7 — migrateTournamentRecord one-shot upgrade utility.
 *
 * Walks a tournamentRecord written by a factory < 5.0.0 (LEGACY-style
 * storage) and promotes every canonical legacy extension and schedule
 * timeItem to its first-class attribute. Idempotent.
 */
import { describe, expect, it } from 'vitest';

import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';

// constants and types
import {
  COMPETITION_STATE,
  DELEGATED_OUTCOME,
  DISABLE_AUTO_CALC,
  DISABLE_LINKS,
  DISABLED,
  DRAFT_STATE,
  FACTORY,
  FLIGHT_PROFILE,
  LINEUPS,
  LINKED_TOURNAMENTS,
  ROUND_TARGET,
  SCHEDULE_LIMITS,
  SCHEDULE_TIMING,
  SCHEDULING_PROFILE,
  SUB_ORDER,
  TALLY,
} from '@Constants/extensionConstants';
import { ASSIGN_COURT, END_TIME, SCHEDULED_DATE, SCHEDULED_TIME, START_TIME } from '@Constants/timeItemConstants';

function buildLegacyRecord(): any {
  return {
    tournamentId: 't1',
    extensions: [
      { name: FACTORY, value: { version: '4.2.0' } },
      { name: LINKED_TOURNAMENTS, value: { tournamentIds: ['t1', 't2'] } },
      { name: SCHEDULING_PROFILE, value: [{ scheduleDate: '2026-01-05', venues: [] }] },
      { name: SCHEDULE_LIMITS, value: { dailyLimits: { default: 3 } } },
      { name: SCHEDULE_TIMING, value: { matchUpAverageTimes: [{ matchUpFormat: 'SET3', minutes: 60 }] } },
    ],
    venues: [
      {
        venueId: 'v1',
        extensions: [{ name: DISABLED, value: true }],
        courts: [
          { courtId: 'c1', extensions: [{ name: DISABLED, value: { dates: ['2026-01-05'] } }] },
          { courtId: 'c2', extensions: [] },
        ],
      },
    ],
    events: [
      {
        eventId: 'e1',
        extensions: [{ name: FLIGHT_PROFILE, value: { flights: [{ drawId: 'd1', flightNumber: 1 }] } }],
        entries: [{ participantId: 'p1', extensions: [{ name: ROUND_TARGET, value: 2 }] }],
        drawDefinitions: [
          {
            drawId: 'd1',
            extensions: [
              { name: FLIGHT_PROFILE, value: { flights: [{ drawId: 'd1' }] } },
              { name: LINEUPS, value: { 'team-1': [] } },
              { name: DRAFT_STATE, value: { status: 'SEEDS_PLACED' } },
              { name: COMPETITION_STATE, value: { roundStates: {} } },
            ],
            entries: [{ participantId: 'p1', extensions: [{ name: ROUND_TARGET, value: 1 }] }],
            structures: [
              {
                structureId: 's1',
                extensions: [{ name: ROUND_TARGET, value: 3 }],
                positionAssignments: [
                  {
                    drawPosition: 1,
                    participantId: 'p1',
                    extensions: [
                      { name: TALLY, value: { matchUpsWon: 3, matchUpsLost: 0 } },
                      { name: SUB_ORDER, value: 1 },
                      { name: DISABLE_LINKS, value: true },
                    ],
                  },
                ],
                matchUps: [
                  {
                    matchUpId: 'm1',
                    extensions: [
                      { name: DELEGATED_OUTCOME, value: { winningSide: 1 } },
                      { name: DISABLE_AUTO_CALC, value: true },
                    ],
                    timeItems: [
                      { itemType: SCHEDULED_DATE, itemValue: '2026-01-05', createdAt: '2026-01-04T10:00:00Z' },
                      { itemType: SCHEDULED_TIME, itemValue: '14:00', createdAt: '2026-01-04T10:00:00Z' },
                      { itemType: ASSIGN_COURT, itemValue: 'c1', createdAt: '2026-01-04T10:00:00Z' },
                      // lifecycle items — should NOT be promoted
                      { itemType: START_TIME, itemValue: '14:00', createdAt: '2026-01-05T14:00:00Z' },
                      { itemType: END_TIME, itemValue: '15:30', createdAt: '2026-01-05T15:30:00Z' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('migrateTournamentRecord — promotion coverage', () => {
  it('promotes every canonical legacy extension to a first-class attribute', () => {
    const record = buildLegacyRecord();
    const result = migrateTournamentRecord({ tournamentRecord: record });
    expect(result.success).toEqual(true);

    // tournament-level
    expect(record.factory).toEqual({ version: '4.2.0' });
    expect(record.linkedTournamentIds).toEqual(['t1', 't2']); // shape flattened
    expect(record.scheduling?.profile).toEqual([{ scheduleDate: '2026-01-05', venues: [] }]);
    expect(record.scheduling?.dailyLimits).toEqual({ dailyLimits: { default: 3 } });
    expect(record.scheduling?.timing).toEqual({ matchUpAverageTimes: [{ matchUpFormat: 'SET3', minutes: 60 }] });

    // venue / court
    expect(record.venues[0].disabled).toEqual(true);
    expect(record.venues[0].courts[0].disabled).toEqual({ dates: ['2026-01-05'] });

    // event + event-level entry
    expect(record.events[0].flightProfile).toEqual({ flights: [{ drawId: 'd1', flightNumber: 1 }] });
    expect(record.events[0].entries[0].roundTarget).toEqual(2);

    // drawDefinition
    const dd = record.events[0].drawDefinitions[0];
    expect(dd.flightProfile).toEqual({ flights: [{ drawId: 'd1' }] });
    expect(dd.lineUps).toEqual({ 'team-1': [] });
    expect(dd.draftState).toEqual({ status: 'SEEDS_PLACED' });
    expect(dd.competitionState).toEqual({ roundStates: {} });
    expect(dd.entries[0].roundTarget).toEqual(1);

    // structure
    const structure = dd.structures[0];
    expect(structure.roundTarget).toEqual(3);

    // positionAssignment
    const pa = structure.positionAssignments[0];
    expect(pa.tally).toEqual({ matchUpsWon: 3, matchUpsLost: 0 });
    expect(pa.subOrder).toEqual(1);
    expect(pa.disableLinks).toEqual(true);

    // matchUp
    const matchUp = structure.matchUps[0];
    expect(matchUp.delegatedOutcome).toEqual({ winningSide: 1 });
    expect(matchUp.disableAutoCalc).toEqual(true);
    expect(matchUp.schedule?.scheduledDate).toEqual('2026-01-05');
    expect(matchUp.schedule?.scheduledTime).toEqual('14:00');
    expect(matchUp.schedule?.courtId).toEqual('c1');
  });

  it('preserves lifecycle timeItems (START / END / STOP / RESUME)', () => {
    const record = buildLegacyRecord();
    migrateTournamentRecord({ tournamentRecord: record });
    const matchUp = record.events[0].drawDefinitions[0].structures[0].matchUps[0];
    const types = (matchUp.timeItems ?? []).map((t: any) => t.itemType);
    expect(types).toContain(START_TIME);
    expect(types).toContain(END_TIME);
    expect(types).not.toContain(SCHEDULED_DATE);
    expect(types).not.toContain(SCHEDULED_TIME);
    expect(types).not.toContain(ASSIGN_COURT);
  });

  it('strips the legacy extensions / timeItems by default', () => {
    const record = buildLegacyRecord();
    migrateTournamentRecord({ tournamentRecord: record });
    expect(record.extensions).toEqual([]);
    expect(record.venues[0].extensions).toEqual([]);
    expect(record.events[0].extensions).toEqual([]);
  });

  it('preserves both surfaces when clearLegacy: false (shadow mode)', () => {
    const record = buildLegacyRecord();
    migrateTournamentRecord({ tournamentRecord: record, clearLegacy: false });

    // first-class is written
    expect(record.factory).toEqual({ version: '4.2.0' });
    // legacy extension is also retained
    expect(record.extensions.some((e: any) => e.name === FACTORY)).toEqual(true);
  });

  it('is idempotent — running twice promotes nothing new and does not alter values', () => {
    const record = buildLegacyRecord();
    const first = migrateTournamentRecord({ tournamentRecord: record });
    expect(first.totalPromoted).toBeGreaterThan(0);

    const second = migrateTournamentRecord({ tournamentRecord: record });
    expect(second.totalPromoted).toEqual(0);
    expect(record.factory).toEqual({ version: '4.2.0' });
    expect(record.linkedTournamentIds).toEqual(['t1', 't2']);
  });

  it('does not overwrite an existing first-class value when running over a partially-migrated record', () => {
    const record = buildLegacyRecord();
    // Pre-set a different first-class value before running
    record.factory = { version: 'preset' };
    migrateTournamentRecord({ tournamentRecord: record });
    // first-class wins; legacy was still cleared
    expect(record.factory).toEqual({ version: 'preset' });
    expect(record.extensions.some((e: any) => e.name === FACTORY)).toEqual(false);
  });

  it('returns counts grouped by entity surface', () => {
    const record = buildLegacyRecord();
    const result = migrateTournamentRecord({ tournamentRecord: record });
    expect(result.promoted?.tournament).toBe(5); // factory + linkedTournamentIds + 3 scheduling
    expect(result.promoted?.events).toBe(1);
    expect(result.promoted?.entries).toBe(2);
    expect(result.promoted?.drawDefinitions).toBe(4);
    expect(result.promoted?.structures).toBe(1);
    expect(result.promoted?.positionAssignments).toBe(3);
    expect(result.promoted?.matchUps).toBe(2);
    expect(result.promoted?.matchUpScheduleTimeItems).toBe(3);
    expect(result.promoted?.venues).toBe(1);
    expect(result.promoted?.courts).toBe(1);
  });

  it('returns an error when tournamentRecord is missing', () => {
    const result = migrateTournamentRecord({ tournamentRecord: undefined as any });
    expect(result.error).toBeDefined();
  });
});
