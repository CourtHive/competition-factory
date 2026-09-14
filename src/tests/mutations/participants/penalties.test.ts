import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { penaltyConstants } from '@Constants/penaltyConstants';
const { BALL_ABUSE } = penaltyConstants;

it('can add, remove, and edit penalties for participants', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100 },
  });

  tournamentEngine.setState(tournamentRecord);

  const participants = tournamentRecord.participants;

  const { participantId } = participants[0];
  const { participant } = tournamentEngine.findParticipant({ participantId });
  expect(participant.participantId).toEqual(participantId);

  const createdAt = new Date().toISOString();

  const penaltyData = {
    refereeParticipantId: undefined,
    participantIds: [participantId],
    penaltyType: BALL_ABUSE,
    penaltyCode: 'ORGCODE',
    matchUpId: 'fakeMatchUpId',
    createdAt,
    notes: 'Hit ball into sea',
  };
  let result = tournamentEngine.addPenalty(penaltyData);
  const { penaltyId } = result;
  expect(result.success).toEqual(true);

  let { penalties } = tournamentEngine.getTournamentPenalties();
  expect(penalties.length).toEqual(1);

  const notes = 'Hit ball into spectator';
  const modifications = { notes };
  result = tournamentEngine.modifyPenalty({ penaltyId, modifications });
  expect(result.penalty.notes).toEqual(notes);
  expect(result.penalty.penaltyCode).toEqual('ORGCODE');

  result = tournamentEngine.removePenalty({ penaltyId });
  expect(result.success).toEqual(true);

  ({ penalties } = tournamentEngine.getTournamentPenalties());
  expect(penalties.length).toEqual(0);
});
