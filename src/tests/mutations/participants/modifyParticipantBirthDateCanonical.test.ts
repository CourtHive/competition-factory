import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Regression: modifyParticipant must read and store the canonical person.birthDate.
// It previously destructured/wrote the non-canonical `person.birthdate`, so a
// birthDate supplied by any consumer (TMX, pdf-factory, etc.) was silently ignored
// and never reached the field category age-eligibility (categoryValidation) reads.
it('modifyParticipant stores birthDate under the canonical person.birthDate field', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 6 },
    setState: true,
  });

  const participant = tournamentEngine.getParticipants().participants[0];

  const result: any = tournamentEngine.modifyParticipant({
    participant: {
      ...participant,
      person: { ...participant.person, birthDate: '1990-03-04' },
    },
  });
  expect(result.success).toEqual(true);

  const { participant: updated } = tournamentEngine.findParticipant({
    participantId: participant.participantId,
  });
  // stored under canonical birthDate — the field categoryValidation age-checks read
  expect(updated.person.birthDate).toEqual('1990-03-04');
  // and not leaked under the old lowercase key
  expect(updated.person.birthdate).toBeUndefined();
});
