import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('can modify participant participantOtherName', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();

  tournamentEngine.setState(tournamentRecord);
  let {
    participants: [participant],
  } = tournamentEngine.getParticipants();

  const { participantId } = participant;
  let result = tournamentEngine.modifyParticipantOtherName({
    participantId,
  });
  // An omitted participantOtherName is accepted and is a no-op. Until 7.0.0 it was accepted and
  // OVERWROTE the stored value with `undefined`; the contract now says `undefined` leaves the
  // field untouched. The distinction is pinned in clearParticipantFields.test.ts.
  expect(result.success).toEqual(true);

  const participantOtherName = 'Nickname';
  result = tournamentEngine.modifyParticipantOtherName({
    participantId,
    participantOtherName,
  });
  expect(result.success).toEqual(true);

  ({
    participants: [participant],
  } = tournamentEngine.getParticipants());

  expect(participant.participantOtherName).toEqual(participantOtherName);
});
