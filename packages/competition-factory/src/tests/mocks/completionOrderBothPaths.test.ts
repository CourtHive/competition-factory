import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * A draw is completed in one order whichever profile path made it: its completionGoal, then its outcomes, then every
 * matchUp left when completeAllMatchUps is set and no goal is. A goal wins: exactly that many are completed (CA
 * 2026-10-29).
 */
const completedCount = () =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpStatuses: [COMPLETED] } }).matchUps.length;

it.each([
  ['drawProfiles', { drawProfiles: [{ drawSize: 16, completionGoal: 3 }] }],
  ['eventProfiles', { eventProfiles: [{ drawProfiles: [{ drawSize: 16, completionGoal: 3 }] }] }],
])('a completionGoal wins over completeAllMatchUps (%s)', (_, profile: any) => {
  const result = mocksEngine.generateTournamentRecord({ ...profile, completeAllMatchUps: true, setState: true });
  expect(result.success).toEqual(true);
  expect(completedCount()).toEqual(3);
});

it('outcomes in an eventProfile drawProfile are applied, as in a drawProfile', () => {
  const outcomes = [{ roundNumber: 1, roundPosition: 1, scoreString: '6-1 6-1', winningSide: 1 }];
  for (const profile of [
    { drawProfiles: [{ drawSize: 8, outcomes }] },
    { eventProfiles: [{ drawProfiles: [{ drawSize: 8, outcomes }] }] },
  ]) {
    const result = mocksEngine.generateTournamentRecord({ ...profile, setState: true });
    expect(result.success).toEqual(true);
    const [first] = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { roundNumbers: [1], roundPositions: [1] },
    }).matchUps;
    expect(first.score.scoreStringSide1).toEqual('6-1 6-1');
    expect(first.winningSide).toEqual(1);
    expect(completedCount()).toEqual(1);
  }
});
