import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MODIFICATIONS_FAILED } from '@Constants/errorConditionConstants';

const startDate = '2024-01-15';
const matchUpIds = ['m-1-1', 'm-1-2', 'm-1-3'];

function seed() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, idPrefix: 'm' }],
    venueProfiles: [{ courtsCount: 3 }],
    endDate: startDate,
    setState: true,
    startDate,
  });
  const { tournamentId } = tournamentRecord;
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const { courts } = tournamentEngine.getVenuesAndCourts();
  matchUpIds.forEach((matchUpId, index) => {
    const { courtId, venueId } = courts[index];
    const scheduledTime = `1${index}:00`;
    const schedule = { scheduledDate: startDate, scheduledTime, courtId, venueId, courtOrder: 1 };
    const result = tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule });
    expect(result.success).toEqual(true);
  });
  return { tournamentId, drawId };
}

const schedules = () =>
  tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { matchUpIds } })
    .matchUps.map(({ matchUpId, schedule }) => [matchUpId, schedule.scheduledTime, schedule.courtOrder])
    .sort((a, b) => a[0].localeCompare(b[0]));

const contextIds = ({ tournamentId, drawId }) =>
  matchUpIds.map((matchUpId, index) => ({
    schedule: { scheduledTime: `1${index}:00` },
    tournamentId,
    matchUpId,
    drawId,
  }));

it('B5: a reorder that cannot resolve one matchUp writes nothing', () => {
  const ids = seed();
  const before = schedules();

  const matchUpsContextIds = contextIds(ids);
  matchUpsContextIds[1].drawId = 'bogus';

  // the `return` inside forEach did not stop the loop: m-1-1 and m-1-3 were rotated (m-1-3 then shared
  // m-1-2's 11:00) and only then was MODIFICATIONS_FAILED reported
  const result = tournamentEngine.reorderUpcomingMatchUps({ matchUpsContextIds, firstToLast: true });
  expect(result.error).toEqual(MODIFICATIONS_FAILED);
  expect(schedules()).toEqual(before);
});

it('B5: a reorder rotates scheduledTime only; courtOrder is a row on a court, not a place in the time list', () => {
  const ids = seed();

  const result = tournamentEngine.reorderUpcomingMatchUps({ matchUpsContextIds: contextIds(ids), firstToLast: true });
  expect(result.success).toEqual(true);
  expect(schedules()).toEqual([
    ['m-1-1', '12:00', 1],
    ['m-1-2', '10:00', 1],
    ['m-1-3', '11:00', 1],
  ]);
});
