import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

import tournamentRecord from './participantFail.tods.json';

it('hydrated tieMatchUps can be processed successfully', () => {
  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.getParticipants();
  expect(result.participants.length);

  result = tournamentEngine.getParticipants({ inContext: true });
  expect(result.participants.length);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
  });

  for (const matchUp of matchUps) {
    expect(matchUp.drawPositions).not.toBeUndefined();
    expect(matchUp.sides[0].lineUp).toBeUndefined();
  }
});
