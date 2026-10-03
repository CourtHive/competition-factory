import { MATRIX_CELLS, MATRIX_DRAW_TYPES, cellExitOutcome } from '@Tests/testHarness/exitPropagation/matrixCells';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { checkIntegrity } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, test } from 'vitest';

// constants
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * EXITS ON A SCHEDULED DRAW — assessment gap G13.
 *
 * The rule is settled and documented (`schedule-governor.md` § Assigning a BYE preserves
 * scheduling): the engine never discards a placement on its own. A matchUp that becomes a BYE keeps
 * its court, order and times; only an explicit `preserveScheduling: false` releases them, and that
 * decision travels with the BYE through everything it reaches. Visibility is the read side's job —
 * `competitionScheduleMatchUps({ courtByeMatchUps: true })` and `CONFLICT_BYE_SCHEDULED`.
 *
 * What no oracle had done is run the exit cascade over a draw that was scheduled first, so
 * `releaseByeScheduling` inside `advanceWinner` — the release for a BYE advancing INTO a scheduled
 * matchUp — had never executed. Two arms:
 *
 *  - **the cascade preserves**: every matchUp scheduled (court, venue, date, time) before play, then
 *    the matrix body over the drawSize-8 cells. No slot moves, and every matrix property and the
 *    integrity check hold on the scheduled draw. Measured 2026-10-01 on first contact: 300 of 300.
 *  - **a decision travels**: a BYE placed by an operator with `preserveScheduling: false` releases
 *    the slot of every matchUp it makes BYE-held — its own, and the ones it advances through when
 *    it meets another BYE — and nothing else; `true` and the default release nothing.
 *
 * The operator's "replace this participant with a BYE" action takes `removeDrawPositionAssignment`,
 * which forwards `preserveScheduling` without `isPositionAction`, so an occupied, scheduled seat is
 * byed with its placement preserved rather than refused; the `MATCHUP_HAS_SCHEDULING` refusal is
 * for a BYE assigned to an EMPTY scheduled seat (`byeSchedulingPreservation.test.ts`).
 */

const DATE = '2026-10-10';
const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
const slot = (matchUp: any) =>
  JSON.stringify({
    courtId: matchUp.schedule?.courtId,
    venueId: matchUp.schedule?.venueId,
    scheduledDate: matchUp.schedule?.scheduledDate,
    scheduledTime: matchUp.schedule?.scheduledTime,
  });
const EMPTY_SLOT = slot({});

function generate({ drawId, drawType, drawSize, participantsCount, seed }: any) {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 6, startTime: '08:00', endTime: '22:00' }],
    drawProfiles: [{ drawId, drawType, drawSize, participantsCount }],
    startDate: DATE,
    endDate: '2026-10-12',
    nonRandom: seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
}

/** court, venue, date and time on every matchUp; returns each matchUp's slot as placed */
function scheduleEverything(drawId: string): Record<string, string> {
  const courts = tournamentEngine.getVenuesAndCourts().courts ?? [];
  expect(courts.length).toBeGreaterThan(0);
  const targets = allMatchUps().filter((matchUp) => !matchUp.collectionId);
  for (const [index, matchUp] of targets.entries()) {
    const court = courts[index % courts.length];
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: {
        scheduledTime: `${String(8 + (index % 12)).padStart(2, '0')}:00`,
        scheduledDate: DATE,
        courtId: court.courtId,
        venueId: court.venueId,
      },
      matchUpId: matchUp.matchUpId,
      drawId,
    });
    expect(result.success, `scheduling ${matchUp.matchUpId}`).toEqual(true);
  }
  const placed: Record<string, string> = {};
  for (const matchUp of allMatchUps()) placed[matchUp.matchUpId] = slot(matchUp);
  // CONTROL: everything holds a slot
  expect(Object.values(placed).every((value) => value !== EMPTY_SLOT)).toEqual(true);
  return placed;
}

const SCHEDULED_CELLS = MATRIX_CELLS.filter((cell) => cell.drawSize === 8);

test('the arm covers every draw type of the matrix at drawSize 8', () => {
  expect(SCHEDULED_CELLS).toHaveLength(300);
  expect(new Set(SCHEDULED_CELLS.map((cell) => cell.drawType)).size).toEqual(MATRIX_DRAW_TYPES.length);
});

test.for(SCHEDULED_CELLS)(
  'scheduled $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus keeps every slot',
  (cell) => {
    const drawId = `scheduled-${cell.seed}`;
    generate({ drawId, ...cell });
    const placed = scheduleEverything(drawId);

    const target = nextPlayable(drawId);
    expect(target?.matchUpId).toBeDefined();
    const outcome = cellExitOutcome(cell.exitStatus);
    const failures = [
      ...step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome }),
    ];
    if (!failures.length) {
      failures.push(
        ...playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId }).failures,
      );
    }
    if (!failures.length) failures.push(...checkIntegrity(drawId, target.matchUpId));
    expect(failures.map((failure) => `${failure.property}: ${failure.detail}`)).toEqual([]);

    // THE RULE: the cascade released nothing
    const moved = allMatchUps()
      .filter((matchUp) => placed[matchUp.matchUpId] !== undefined && placed[matchUp.matchUpId] !== slot(matchUp))
      .map(
        (matchUp) =>
          `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition} ${matchUp.matchUpStatus}`,
      );
    expect(moved).toEqual([]);
  },
);

/** the BYE action positionActions offers for an occupied seat, with the operator's decision attached */
function byeTheSeat(drawId: string, structureId: string, drawPosition: number, preserveScheduling?: boolean) {
  const { validActions } = tournamentEngine.positionActions({ drawId, structureId, drawPosition });
  const action = validActions?.find((candidate: any) => candidate.type === BYE);
  expect(action, 'a BYE action is offered').toBeDefined();
  const result: any = tournamentEngine[action.method]({
    ...action.payload,
    ...(preserveScheduling === undefined ? {} : { preserveScheduling }),
  });
  expect(result.success).toEqual(true);
}

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it.each(MATRIX_DRAW_TYPES.map((drawType) => ({ drawType })))(
  '$drawType: `preserveScheduling: false` releases exactly what the BYE makes BYE-held; `true` and the default release nothing',
  ({ drawType }) => {
    const outcomes: Record<string, string[]> = {};
    for (const preserveScheduling of [false, true, undefined]) {
      const drawId = `release-${drawType}-${String(preserveScheduling)}`;
      generate({ drawId, drawType, drawSize: 8, participantsCount: 8, seed: 500001 });
      const placed = scheduleEverything(drawId);
      const { structureId } = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];

      // seat 2 first, then seat 1: the second BYE meets the first, and a BYE advances into round 2
      byeTheSeat(drawId, structureId, 2, preserveScheduling);
      byeTheSeat(drawId, structureId, 1, preserveScheduling);

      const released = allMatchUps().filter((matchUp) => placed[matchUp.matchUpId] !== slot(matchUp));
      // a released matchUp is emptied of its slot entirely, never partially
      expect(released.every((matchUp) => slot(matchUp) === EMPTY_SLOT)).toEqual(true);
      outcomes[String(preserveScheduling)] = released.map(coordinate).sort((a, b) => a.localeCompare(b));

      if (preserveScheduling === false) {
        const byeHeld = allMatchUps()
          .filter((matchUp) => matchUp.matchUpStatus === BYE && placed[matchUp.matchUpId] !== undefined)
          .map(coordinate)
          .sort((a, b) => a.localeCompare(b));
        // CONTROL: the second BYE advanced into round 2, so a matchUp beyond round 1 is BYE-held —
        // the `advanceWinner` release this arm exists to execute
        expect(byeHeld.some((key) => !key.includes('|1|'))).toEqual(true);
        // THE RULE: released === BYE-held, exactly
        expect(outcomes.false).toEqual(byeHeld);
      }
    }
    expect(outcomes.true).toEqual([]);
    expect(outcomes.undefined).toEqual([]);
  },
);
