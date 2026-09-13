import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR } from '@Constants/participantRoles';

/**
 * Whitespace in a person name is invisible until something compares the string.
 *
 * A trailing space left in a first-name field composes `'Michael  Livson'`, which
 * renders correctly everywhere — HTML collapses the run — and then fails to match
 * a search for `'Michael Livson'`. These cover the write boundaries so no consumer
 * can compose one.
 */

it('collapses whitespace in the person names addParticipant composes from', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const result: any = tournamentEngine.addParticipant({
    participant: {
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      person: {
        standardGivenName: 'Michael ',
        standardFamilyName: ' Livson',
      },
    },
    returnParticipant: true,
  });

  expect(result.success).toEqual(true);
  expect(result.participant.person.standardGivenName).toEqual('Michael');
  expect(result.participant.person.standardFamilyName).toEqual('Livson');
  expect(result.participant.participantName).toEqual('Michael Livson');
});

it('collapses whitespace in a participantName supplied to addParticipant', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const result: any = tournamentEngine.addParticipant({
    participant: {
      participantType: INDIVIDUAL,
      participantRole: COMPETITOR,
      participantName: '  Michael   Livson  ',
      person: { standardGivenName: 'Michael', standardFamilyName: 'Livson' },
    },
    returnParticipant: true,
  });

  expect(result.success).toEqual(true);
  expect(result.participant.participantName).toEqual('Michael Livson');
});

it('collapses whitespace in the person names modifyParticipant composes from', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants();
  const { participantId } = participants[0];

  const result: any = tournamentEngine.modifyParticipant({
    participant: {
      participantId,
      participantType: INDIVIDUAL,
      person: { standardGivenName: 'Michael ', standardFamilyName: 'Livson' },
    },
  });
  expect(result.success).toEqual(true);

  const { participants: modified } = tournamentEngine.getParticipants();
  const participant: any = modified.find((p: any) => p.participantId === participantId);
  expect(participant.person.standardGivenName).toEqual('Michael');
  expect(participant.participantName).toEqual('Michael Livson');
});

it('repairs a stored double space when the OTHER name is the one being edited', () => {
  // The regression this guards: normalizing only the INCOMING values leaves a
  // record that already carries 'Michael ' re-composing the double space every
  // time its family name is edited.
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  const individual: any = tournamentRecord.participants?.find((p: any) => p.participantType === INDIVIDUAL);
  individual.person.standardGivenName = 'Michael ';
  individual.person.standardFamilyName = 'Livsen';
  individual.participantName = 'Michael  Livsen';
  tournamentEngine.setState(tournamentRecord);

  const result: any = tournamentEngine.modifyParticipant({
    participant: {
      participantId: individual.participantId,
      participantType: INDIVIDUAL,
      person: { standardFamilyName: 'Livson' },
    },
  });
  expect(result.success).toEqual(true);

  const { participants } = tournamentEngine.getParticipants();
  const participant: any = participants.find((p: any) => p.participantId === individual.participantId);
  expect(participant.participantName).toEqual('Michael Livson');
});
