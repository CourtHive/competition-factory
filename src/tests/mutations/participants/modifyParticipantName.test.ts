import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('can modify participant names', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);
  let {
    participants: [participant],
  } = tournamentEngine.getParticipants();

  const { participantId } = participant;
  let result = tournamentEngine.modifyParticipantName({ participantId });
  expect(result.error).not.toBeUndefined();

  const participantName = 'Participant Name';
  result = tournamentEngine.modifyParticipantName({
    participantId,
    participantName,
  });
  expect(result.success).toEqual(true);

  ({
    participants: [participant],
  } = tournamentEngine.getParticipants());

  expect(participant.participantName).toEqual(participantName);
});
