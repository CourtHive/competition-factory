import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * BULK SCHEDULING IS A BULK METHOD. Each matchUp is planned and committed on its own; a refused one ends the batch with
 * nothing of its own written, and the matchUps before it stay written, as the batch always kept them. The call now says
 * so: `results` per matchUp, `committed: true` on a refusal after a commit, and `rollbackOnError` restores the whole
 * call from a snapshot (it is listed in PARTIAL_COMMIT_METHODS) rather than reporting a rollback over the kept writes.
 */
function scheduled() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', idPrefix: 'm', drawSize: 8 }],
    venueProfiles: [{ courtsCount: 2 }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
  const { tournamentId, startDate } = tournamentRecord;
  const [first, second] = ['m-1-1', 'm-1-2'];
  const matchUpDetails = [
    { matchUpId: first, drawId: 'd', tournamentId, schedule: { scheduledDate: startDate, scheduledTime: '09:00' } },
    // a venue the tournament does not hold: refused at this matchUp, after the first is planned
    { matchUpId: second, drawId: 'd', tournamentId, schedule: { scheduledDate: startDate, venueId: 'nowhere' } },
  ];
  const stored = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  const scheduledDate = (matchUpId: string) =>
    tournamentEngine.findMatchUp({ drawId: 'd', matchUpId, inContext: false }).matchUp.schedule?.scheduledDate;
  return { matchUpDetails, stored, scheduledDate, first, second, startDate };
}

it('reports each matchUp, and that the ones before the refusal were committed', () => {
  const { matchUpDetails, scheduledDate, first, second, startDate } = scheduled();
  const result: any = tournamentEngine.bulkScheduleTournamentMatchUps({ matchUpDetails });
  expect(result.error).toBeDefined();
  expect(result.committed).toEqual(true);
  expect(result.results).toEqual([
    { index: 0, matchUpId: first, success: true },
    { index: 1, matchUpId: second, error: result.error },
  ]);
  expect(scheduledDate(first)).toEqual(startDate);
  expect(scheduledDate(second)).toBeUndefined();
});

it('with rollbackOnError, the whole call is put back', () => {
  const { matchUpDetails, stored } = scheduled();
  const before = stored();
  const result: any = tournamentEngine.bulkScheduleTournamentMatchUps({ matchUpDetails, rollbackOnError: true });
  expect(result.error).toBeDefined();
  expect(result.rolledBack).toEqual(true);
  expect(stored()).toEqual(before);
});

it('the competition-wide batch says so too', () => {
  const { matchUpDetails } = scheduled();
  const result: any = tournamentEngine.bulkScheduleMatchUps({ matchUpDetails });
  expect(result.error).toBeDefined();
  expect(result.committed).toEqual(true);
});
