import { removeCourtAssignment } from '@Mutate/matchUps/schedule/removeCourtAssignment';
import { writeModeMatrix } from '@Tests/testHarness/writeModeMatrix';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import {
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

/**
 * Every schedule mutation marks its draw modified, and a refused one does not. These were pinned only inside the
 * scheduleMatchUps2 journey, under LEGACY storage only, where one check credited a bump to a refused call. Here each
 * mutation runs on a fresh draw in every write mode. (2026-10-17 test-infrastructure survey, plan item F.)
 */
const scheduledDate = '2024-03-01';

// at least one millisecond must pass before the mutation, or updatedAt cannot move
const forceDelay = (delay = 10) => new Promise((resolve) => setTimeout(resolve, delay));

function scheduledDraw() {
  const {
    drawIds: [drawId],
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    venueProfiles: [{ courtsCount: 1 }],
    startDate: scheduledDate,
    setState: true,
  });
  const { courts } = tournamentEngine.getCourts();
  const matchUpId = tournamentEngine.allTournamentMatchUps().matchUps[0].matchUpId;
  const updatedAt = () => tournamentEngine.getEvent({ drawId }).drawDefinition.updatedAt;
  return { drawId, venueId, courtId: courts[0].courtId, matchUpId, updatedAt };
}

type Draw = ReturnType<typeof scheduledDraw>;
const mutations: [string, (draw: Draw) => any][] = [
  ['assignMatchUpVenue', (d) => tournamentEngine.assignMatchUpVenue({ ...d, venueId: d.venueId })],
  [
    'assignMatchUpCourt',
    (d) => tournamentEngine.assignMatchUpCourt({ ...d, courtId: d.courtId, courtDayDate: scheduledDate }),
  ],
  ['addMatchUpScheduledDate', (d) => tournamentEngine.addMatchUpScheduledDate({ ...d, scheduledDate })],
  ['addMatchUpScheduledTime', (d) => tournamentEngine.addMatchUpScheduledTime({ ...d, scheduledTime: '08:00' })],
  ['addMatchUpStartTime', (d) => tournamentEngine.addMatchUpStartTime({ ...d, startTime: '08:00' })],
  ['addMatchUpEndTime', (d) => tournamentEngine.addMatchUpEndTime({ ...d, endTime: '14:30' })],
];

writeModeMatrix((mode) => {
  it.each(mutations)(`%s marks the draw modified (${mode})`, async (_name, mutate) => {
    const draw = scheduledDraw();
    const before = draw.updatedAt();
    await forceDelay();
    expect(mutate(draw).success).toEqual(true);
    expect(new Date(draw.updatedAt()).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it.each(mutations)(`%s refused for a missing matchUpId leaves the draw untouched (${mode})`, async (_n, mutate) => {
    const draw = scheduledDraw();
    const before = draw.updatedAt();
    await forceDelay();
    expect(mutate({ ...draw, matchUpId: undefined as any }).error).toEqual(MISSING_MATCHUP_ID);
    expect(draw.updatedAt()).toEqual(before);
  });
});

describe('removeCourtAssignment refusals (direct call)', () => {
  it('names what is missing, in the order it checks', () => {
    const { drawId, matchUpId } = scheduledDraw();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    let result: any = removeCourtAssignment({ drawDefinition } as any);
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
    result = removeCourtAssignment({ matchUpId } as any);
    expect(result.error).toEqual(MISSING_DRAW_ID);
    result = removeCourtAssignment({ matchUpId, drawId } as any);
    expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
    result = removeCourtAssignment({ drawDefinition, matchUpId: 'unknown' } as any);
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
    result = removeCourtAssignment({ drawDefinition, matchUpId } as any);
    expect(result.success).toEqual(true);
  });
});
