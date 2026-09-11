import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

/**
 * `updatePerson` could set a person field but never unset one.
 *
 * - `birthDate` was gated on `if (birthDate)`, so an emptied field was a silent no-op: a
 *   wrong date of birth could be corrected but never removed.
 * - `nationalityCode` *looked* clearable — its condition carried `|| nationalityCode === ''`
 *   with the comment "empty string to remove value" — but the leading `nationalityCode &&`
 *   in the same expression short-circuits on `''` first, so the clear branch was unreachable.
 *
 * An explicit empty string now means "clear", and clearing DELETES the key rather than
 * storing `''`, so consumers reading `person.birthDate` / `person.nationalityCode` see an
 * absent field instead of a falsy one they would each have to special-case.
 *
 * `undefined` must keep meaning "leave untouched": consumers such as TMX send the whole
 * person object on every save, so a field they do not manage must survive.
 */

function seedParticipantWithPerson() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
    setState: true,
  });

  const participant = tournamentEngine.getParticipants().participants[0];
  const result: any = tournamentEngine.modifyParticipant({
    participant: {
      ...participant,
      person: { ...participant.person, nationalityCode: 'FRA', birthDate: '1990-03-04' },
    },
  });
  expect(result.success).toEqual(true);

  const seeded = tournamentEngine.findParticipant({ participantId: participant.participantId }).participant;
  expect(seeded.person.birthDate).toEqual('1990-03-04');
  expect(seeded.person.nationalityCode).toEqual('FRA');

  return seeded;
}

function personAfterModify(participant: any, person: any) {
  const result: any = tournamentEngine.modifyParticipant({ participant: { ...participant, person } });
  expect(result.success).toEqual(true);
  return tournamentEngine.findParticipant({ participantId: participant.participantId }).participant.person;
}

describe('clearing person fields via modifyParticipant', () => {
  it('an empty birthDate removes the stored value', () => {
    const participant = seedParticipantWithPerson();
    const person = personAfterModify(participant, { ...participant.person, birthDate: '' });

    expect(person.birthDate).toBeUndefined();
    // clearing one field must not disturb its neighbours
    expect(person.nationalityCode).toEqual('FRA');
    expect(person.standardGivenName).toEqual(participant.person.standardGivenName);
  });

  it('an empty nationalityCode removes the stored value', () => {
    const participant = seedParticipantWithPerson();
    const person = personAfterModify(participant, { ...participant.person, nationalityCode: '' });

    expect(person.nationalityCode).toBeUndefined();
    expect(person.birthDate).toEqual('1990-03-04');
  });

  it('clears both at once', () => {
    const participant = seedParticipantWithPerson();
    const person = personAfterModify(participant, { ...participant.person, nationalityCode: '', birthDate: '' });

    expect(person.birthDate).toBeUndefined();
    expect(person.nationalityCode).toBeUndefined();
  });

  it('omitting a field leaves it untouched — undefined is not a clear', () => {
    const participant = seedParticipantWithPerson();
    const { birthDate: _birthDate, nationalityCode: _nationalityCode, ...personWithoutThem } = participant.person;
    const person = personAfterModify(participant, personWithoutThem);

    expect(person.birthDate).toEqual('1990-03-04');
    expect(person.nationalityCode).toEqual('FRA');
  });

  it('an explicit undefined also leaves the field untouched', () => {
    const participant = seedParticipantWithPerson();
    const person = personAfterModify(participant, {
      ...participant.person,
      nationalityCode: undefined,
      birthDate: undefined,
    });

    expect(person.birthDate).toEqual('1990-03-04');
    expect(person.nationalityCode).toEqual('FRA');
  });

  it('still rejects an invalid birthDate rather than treating it as a clear', () => {
    const participant = seedParticipantWithPerson();
    const result: any = tournamentEngine.modifyParticipant({
      participant: { ...participant, person: { ...participant.person, birthDate: 'garbage' } },
    });

    expect(result.error).not.toBeUndefined();
    const person = tournamentEngine.findParticipant({ participantId: participant.participantId }).participant.person;
    expect(person.birthDate).toEqual('1990-03-04');
  });

  it('still ignores an unrecognised nationalityCode rather than clearing it', () => {
    const participant = seedParticipantWithPerson();
    const person = personAfterModify(participant, { ...participant.person, nationalityCode: 'ZZZ' });

    expect(person.nationalityCode).toEqual('FRA');
  });
});
