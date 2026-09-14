import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import tournamentRecord from './polar.tods.json';

it('can get competitionScheduleMatchUps', () => {
  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.competitionScheduleMatchUps();
  expect(result.dateMatchUps.length).not.toBeUndefined();

  result = tournamentEngine.allTournamentMatchUps();
  expect(result.matchUps.length).not.toBeUndefined();
});
