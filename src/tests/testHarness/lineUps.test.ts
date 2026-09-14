import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import tournamentRecord from './lineUps.tods.json';

it('can get competitionScheduleMatchUps', () => {
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    withMatchUps: true,
  });

  const participantId = 'BFFDEFF0-C0EA-453D-A813-DCCB767C150A';

  const participant = participants.find((participant) => participant.participantId === participantId);

  expect(participant.matchUps.length).toEqual(8);
});
