import tournamentRecord from './tieFormatTallyDirectives.tods.json';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('can can determine scorecard winner using tallyDirectives', () => {
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: ['TEAM'] },
  });

  const { matchUpId, drawId, tieFormat, winningSide } = matchUp;
  expect(tieFormat.winCriteria.tallyDirectives).toEqual(true);
  expect(winningSide).toBeUndefined();

  result = tournamentEngine.updateTieMatchUpScore({ matchUpId, drawId });
  expect(result.winningSide).toEqual(1);
});
