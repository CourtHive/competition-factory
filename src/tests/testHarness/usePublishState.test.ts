import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Test data
import tournamentRecord from './publishState.tods.json';

it('can get competitionScheduleMatchUps', () => {
  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.competitionScheduleMatchUps();
  expect(result.dateMatchUps.length).toEqual(29);

  result = tournamentEngine.competitionScheduleMatchUps({ usePublishState: true });
  expect(result.dateMatchUps.length).toEqual(0);
});
