import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import tournamentRecord from './voluntaryConsolation.tods.json';

it('voluntary consolation test', () => {
  tournamentEngine.setState(tournamentRecord);

  const drawId = tournamentEngine.getTournament().tournamentRecord?.events[1].drawDefinitions[0].drawId;

  const { eligibleParticipants, losingParticipantIds } = tournamentEngine.getEligibleVoluntaryConsolationParticipants({
    requirePlay: false,
    matchUpsLimit: 1,
    drawId,
  });

  expect(losingParticipantIds.length).toEqual(3);
  expect(eligibleParticipants.length).toEqual(3);
});
