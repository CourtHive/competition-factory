import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, describe, expect, it } from 'vitest';

// constants and types
import { CONFLICT_BYE_SCHEDULED, CONFLICT_COURT_DOUBLE_BOOKING } from '@Constants/scheduleConstants';
import { MATCHUP_HAS_SCHEDULING } from '@Constants/errorConditionConstants';
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * Assigning a BYE PRESERVES scheduling.
 *
 * A tournament director may schedule an entire event and then swap participants
 * around, placing byes temporarily or permanently. Wiping the surrounding plan to
 * keep a conflict detector quiet destroys careful work, so:
 *
 * - the default, and every engine-internal path, keeps the placement;
 * - an operator position-action on a matchUp that already holds scheduling is
 *   AMBIGUOUS and returns `MATCHUP_HAS_SCHEDULING` rather than guessing;
 * - `preserveScheduling: true | false` states the intent and is honoured;
 * - a BYE that ends up holding a court is rendered in the grid and annotated
 *   `CONFLICT_BYE_SCHEDULED` at WARNING severity — visible, not silently absorbed.
 *
 * Context: production 2026-08-22 (Battle of Boca). A scheduled R64 matchUp was byed,
 * kept Court 12, and — because byes were bucketed out of every schedule surface —
 * became an invisible occupant. The operator dropped another match on the slot and
 * `proConflicts` reported a `courtDoubleBooking` against a cell that was never drawn.
 * The fix is to make the occupant visible, not to delete the placement.
 *
 * Both write modes are covered: the suite's setup hook pins LEGACY (schedule in
 * `matchUp.timeItems[]`) while production runs NATIVE (first-class `matchUp.schedule.*`).
 */

const START_DATE = '2026-08-22';
const END_DATE = '2026-08-25';

// The setup hook re-pins LEGACY before each test; restore it after each so a
// mode set here doesn't leak into unrelated specs sharing the module worker.
afterEach(() => setSchemaWriteMode(LEGACY));

function setup(mode: string) {
  setSchemaWriteMode(mode as any);
  tournamentEngine.reset();
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8, drawId: 'byeSchedulingDraw' }],
    venueProfiles: [{ courtsCount: 4, startTime: '07:00', endTime: '20:00' }],
    startDate: START_DATE,
    endDate: END_DATE,
    setState: true,
  });
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const playable = matchUps.filter((m: any) => m.sides?.every((side: any) => side.participant));
  return { courts, drawId, matchUps: playable, structureId: playable[0].structureId };
}

function readSchedule(drawId: string, matchUpId: string) {
  return tournamentEngine.findMatchUp({ matchUpId, drawId }).matchUp.schedule ?? {};
}

function readStatus(drawId: string, matchUpId: string) {
  return tournamentEngine.findMatchUp({ matchUpId, drawId }).matchUp.matchUpStatus;
}

function place(drawId: string, matchUpId: string, court: any, courtOrder: number, extra: any = {}) {
  return tournamentEngine.addMatchUpScheduleItems({
    schedule: {
      courtId: court.courtId,
      venueId: court.venueId,
      courtOrder,
      scheduledDate: START_DATE,
      scheduledTime: '07:45',
      ...extra,
    },
    removePriorValues: true,
    matchUpId,
    drawId,
  });
}

function issuesOfType(issueType: string) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true });
  const scheduled = matchUps.filter((m: any) => m.schedule?.courtId && m.schedule?.scheduledDate === START_DATE);
  const { rowIssues } = tournamentEngine.proConflicts({ matchUps: scheduled });
  return Object.values(rowIssues ?? {})
    .flat()
    .filter((issue: any) => issue.issueType === issueType);
}

describe.each([LEGACY, NATIVE])('assigning a BYE preserves scheduling (%s writeMode)', (mode) => {
  it('keeps the placement by default — the engine never discards operator scheduling unasked', () => {
    const { courts, drawId, matchUps, structureId } = setup(mode);
    const target = matchUps[0];
    const court = courts[0];

    expect(place(drawId, target.matchUpId, court, 1).success).toEqual(true);
    const byedPosition = target.drawPositions[1];

    // No isPositionAction, no preserveScheduling — the internal/default path.
    expect(
      tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId }).success,
    ).toEqual(true);
    expect(tournamentEngine.assignDrawPositionBye({ drawPosition: byedPosition, structureId, drawId }).success).toEqual(
      true,
    );

    expect(readStatus(drawId, target.matchUpId)).toEqual(BYE);

    const schedule = readSchedule(drawId, target.matchUpId);
    expect(schedule.courtId).toEqual(court.courtId);
    expect(schedule.courtOrder).toEqual(1);
    expect(schedule.scheduledDate).toEqual(START_DATE);
    expect(schedule.scheduledTime).toEqual('07:45');
  });

  it('refuses an ambiguous position-action rather than guessing, and mutates NOTHING', () => {
    const { courts, drawId, matchUps, structureId } = setup(mode);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });

    const result = tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      isPositionAction: true,
      structureId,
      drawId,
    });
    expect(result.error).toEqual(MATCHUP_HAS_SCHEDULING);

    // The gate runs before any mutation: the position must NOT have become a BYE.
    expect(readStatus(drawId, target.matchUpId)).not.toEqual(BYE);
    const assignments = tournamentEngine.getPositionAssignments({ structureId, drawId }).positionAssignments;
    expect(assignments.find((a: any) => a.drawPosition === byedPosition)?.bye).toBeFalsy();
    expect(readSchedule(drawId, target.matchUpId).courtId).toEqual(courts[0].courtId);
  });

  it('honours preserveScheduling: true', () => {
    const { courts, drawId, matchUps, structureId } = setup(mode);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });

    const result = tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: true,
      isPositionAction: true,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(readStatus(drawId, target.matchUpId)).toEqual(BYE);
    expect(readSchedule(drawId, target.matchUpId).courtId).toEqual(courts[0].courtId);
  });

  it('honours preserveScheduling: false', () => {
    const { courts, drawId, matchUps, structureId } = setup(mode);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });

    const result = tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: false,
      isPositionAction: true,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(readStatus(drawId, target.matchUpId)).toEqual(BYE);

    const schedule = readSchedule(drawId, target.matchUpId);
    expect(schedule.courtId).toBeUndefined();
    expect(schedule.venueId).toBeUndefined();
    expect(schedule.courtOrder).toBeUndefined();
    expect(schedule.scheduledDate).toBeUndefined();
    expect(schedule.scheduledTime).toBeUndefined();
  });

  it('CONTROL: an UNSCHEDULED position-action is unambiguous and needs no boolean', () => {
    // Falsifies the refusal above — if the gate fired on `isPositionAction` alone
    // rather than on held scheduling, this would error too and the test that
    // matters would be proving nothing about scheduling.
    const { drawId, matchUps, structureId } = setup(mode);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });

    const result = tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      isPositionAction: true,
      structureId,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
    expect(readStatus(drawId, target.matchUpId)).toEqual(BYE);
  });
});

describe('a court-holding BYE is visible and flagged, not hidden', () => {
  it('proConflicts annotates CONFLICT_BYE_SCHEDULED at WARNING severity', () => {
    const { courts, drawId, matchUps, structureId } = setup(NATIVE);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: true,
      structureId,
      drawId,
    });

    const flagged = issuesOfType(CONFLICT_BYE_SCHEDULED);
    expect(flagged.length).toEqual(1);
    expect((flagged[0] as any).matchUpId).toEqual(target.matchUpId);
    expect((flagged[0] as any).issue).toEqual('WARNING');
  });

  it('CONTROL: an unscheduled BYE is not flagged — the annotation tracks court occupancy', () => {
    const { drawId, matchUps, structureId } = setup(NATIVE);
    const byedPosition = matchUps[0].drawPositions[1];

    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({ drawPosition: byedPosition, structureId, drawId });

    expect(issuesOfType(CONFLICT_BYE_SCHEDULED)).toEqual([]);
  });

  it('a real double booking outranks the BYE warning on the same matchUp', () => {
    const { courts, drawId, matchUps, structureId } = setup(NATIVE);
    const [target, other] = matchUps;
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: true,
      structureId,
      drawId,
    });

    // The operator can now SEE the BYE on Court 12 — but if they place over it anyway,
    // the double booking is real and must win the annotation.
    place(drawId, other.matchUpId, courts[0], 1);

    expect(issuesOfType(CONFLICT_COURT_DOUBLE_BOOKING).length).toBeGreaterThan(0);
    expect(issuesOfType(CONFLICT_BYE_SCHEDULED)).toEqual([]);
  });

  it('competitionScheduleMatchUps hides the BYE by default and surfaces it under courtByeMatchUps', () => {
    const { courts, drawId, matchUps, structureId } = setup(NATIVE);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    place(drawId, target.matchUpId, courts[0], 1);
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: true,
      structureId,
      drawId,
    });

    const courtMatchUpIds = (courtByeMatchUps?: boolean) =>
      tournamentEngine
        .competitionScheduleMatchUps({ matchUpFilters: { scheduledDate: START_DATE }, courtByeMatchUps })
        .courtsData.flatMap((court: any) => court.matchUps.map((m: any) => m.matchUpId));

    expect(courtMatchUpIds()).not.toContain(target.matchUpId);
    expect(courtMatchUpIds(true)).toContain(target.matchUpId);
  });

  it('a date/time-only BYE stays out of the grid — it occupies no cell', () => {
    const { drawId, matchUps, structureId } = setup(NATIVE);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: START_DATE, scheduledTime: '09:00' },
      matchUpId: target.matchUpId,
      removePriorValues: true,
      drawId,
    });
    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({
      drawPosition: byedPosition,
      preserveScheduling: true,
      structureId,
      drawId,
    });

    const courtsData = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: START_DATE },
      courtByeMatchUps: true,
    }).courtsData;
    const ids = courtsData.flatMap((court: any) => court.matchUps.map((m: any) => m.matchUpId));
    expect(ids).not.toContain(target.matchUpId);

    // ...but the placement it does hold is still intact.
    expect(readSchedule(drawId, target.matchUpId).scheduledTime).toEqual('09:00');
  });

  it('addMatchUpScheduleItems can still place a BYE — a visible cell must be movable', () => {
    const { courts, drawId, matchUps, structureId } = setup(NATIVE);
    const target = matchUps[0];
    const byedPosition = target.drawPositions[1];

    tournamentEngine.removeDrawPositionAssignment({ drawPosition: byedPosition, structureId, drawId });
    tournamentEngine.assignDrawPositionBye({ drawPosition: byedPosition, structureId, drawId });
    expect(readStatus(drawId, target.matchUpId)).toEqual(BYE);

    const result = place(drawId, target.matchUpId, courts[2], 3);
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    expect(readSchedule(drawId, target.matchUpId).courtId).toEqual(courts[2].courtId);
  });
});
