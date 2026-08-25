import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * `addMatchUpScheduleItems` is the batch facade over the per-attribute schedule
 * methods. `calledAt` was absent from the attributes it destructures, so passing
 * one returned `{ success: true }` and wrote nothing — the same silent-drop the
 * `courtIds` / `allocatedCourts` comment in that file was written to fix.
 *
 * It belongs with the actual-play attributes (startTime / stopTime / resumeTime
 * / endTime), which the facade already covers and which the schedule lock
 * deliberately does not guard.
 */

const START_DATE = '2026-06-15';
const CALLED_AT = '2026-06-15T14:00:00.000Z';

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
    setState: true,
    startDate: START_DATE,
  });
  const { matchUps }: any = tournamentEngine.allTournamentMatchUps();
  const { matchUpId, drawId } = matchUps.find((m: any) => m.roundNumber === 1);
  return { matchUpId, drawId };
}

/** Raw read — `findMatchUp` hydrates even without `inContext`. */
function storedSchedule(matchUpId: string, drawId: string) {
  const { drawDefinition }: any = tournamentEngine.getEvent({ drawId });
  for (const structure of drawDefinition?.structures ?? []) {
    const found = (structure.matchUps ?? []).find((m: any) => m.matchUpId === matchUpId);
    if (found) return found.schedule ?? {};
  }
  return {};
}

describe('addMatchUpScheduleItems covers calledAt', () => {
  it('writes calledAt, which previously reported success and did nothing', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { calledAt: CALLED_AT },
    });
    expect(result).toMatchObject(SUCCESS);
    expect(storedSchedule(matchUpId, drawId).calledAt).toEqual(CALLED_AT);
  });

  it('writes it alongside the other attributes in one call', () => {
    const { matchUpId, drawId } = setup();
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, scheduledTime: '14:05', calledAt: CALLED_AT },
    });
    // `scheduledDate` is first-class and so reachable from the raw record;
    // `startTime` is deliberately not asserted here — it is written as a
    // timeItem rather than to `schedule`, so a raw read cannot see it.
    const stored = storedSchedule(matchUpId, drawId);
    expect(stored.calledAt).toEqual(CALLED_AT);
    expect(stored.scheduledDate).toEqual(START_DATE);
  });

  it('clears on an explicit null, matching setMatchUpCalledAt', () => {
    const { matchUpId, drawId } = setup();
    tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { calledAt: CALLED_AT } });
    expect(storedSchedule(matchUpId, drawId).calledAt).toEqual(CALLED_AT);

    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { calledAt: null },
    });
    expect(result).toMatchObject(SUCCESS);
    expect(storedSchedule(matchUpId, drawId).calledAt).toBeUndefined();
  });

  /**
   * The one place the facade deliberately narrows `setMatchUpCalledAt`. Called
   * directly, that method reads `undefined` as "clear"; here an omitted key
   * destructures to `undefined` too, so honouring it would make every partial
   * schedule write silently wipe a call-to-court.
   */
  it('does NOT clear calledAt when the key is simply absent from a later write', () => {
    const { matchUpId, drawId } = setup();
    tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule: { calledAt: CALLED_AT } });

    tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { scheduledDate: START_DATE, scheduledTime: '15:00' },
    });
    expect(storedSchedule(matchUpId, drawId).calledAt).toEqual(CALLED_AT);
  });

  it('rejects a non-string calledAt rather than storing it', () => {
    const { matchUpId, drawId } = setup();
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      matchUpId,
      drawId,
      schedule: { calledAt: 1234 },
    });
    expect(result.error).toBeDefined();
    expect(storedSchedule(matchUpId, drawId).calledAt).toBeUndefined();
  });
});
