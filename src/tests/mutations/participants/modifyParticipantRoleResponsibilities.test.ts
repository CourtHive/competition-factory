import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Regression: modifyParticipant destructured and wrote the misspelled
// `participantRoleResponsibilties`, so the canonical `participantRoleResponsibilities`
// sent by consumers (pdf-factory, TMX) was never read and never stored.
it('modifyParticipant applies canonical participantRoleResponsibilities', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 6 },
    setState: true,
  });

  const participant = tournamentEngine.getParticipants().participants[0];

  const result: any = tournamentEngine.modifyParticipant({
    participant: {
      ...participant,
      participantRoleResponsibilities: ['COACH'],
    },
  });
  expect(result.success).toEqual(true);

  const { participant: updated } = tournamentEngine.findParticipant({
    participantId: participant.participantId,
  });
  expect(updated.participantRoleResponsibilities).toEqual(['COACH']);
});
