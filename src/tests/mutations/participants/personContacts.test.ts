import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { OFFICIAL } from '@Constants/participantRoles';

/**
 * `person.contacts` had no write path. It was declared on the type, readable, and impossible to persist —
 * `updatePerson` destructured seven fields and `contacts` was not among them, and no other mutation
 * touched it.
 *
 * That made `Contact.isPublic` inert by construction: the publication gate on `tournamentContacts` had
 * nothing to gate on, because nothing could set the flag in the first place.
 */

const STAFF_ID = 'staff-1';

function seedStaff(contacts?: any[]) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true, nonRandom: 1 });
  tournamentEngine.addParticipants({
    participants: [
      {
        person: { standardGivenName: 'Rae', standardFamilyName: 'Stringer', nationalityCode: 'USA', contacts },
        participantName: 'Rae Stringer',
        participantType: 'INDIVIDUAL',
        participantRole: OFFICIAL,
        participantId: STAFF_ID,
      },
    ],
  });
}

const readContacts = () =>
  tournamentEngine.getParticipants({ participantFilters: { participantIds: [STAFF_ID] } }).participants?.[0]?.person
    ?.contacts;

describe('person.contacts write path', () => {
  it('persists a contact list', () => {
    seedStaff();
    expect(readContacts()).toBeUndefined(); // control: nothing there to begin with

    const result: any = tournamentEngine.modifyParticipant({
      participant: {
        participantId: STAFF_ID,
        person: { contacts: [{ name: 'desk', mobileTelephone: '+1 555 0100', isPublic: true }] },
      },
    });
    expect(result.success).toEqual(true);

    const contacts = readContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts[0].mobileTelephone).toEqual('+1 555 0100');
    expect(contacts[0].isPublic).toEqual(true);
  });

  it('round-trips an isPublic toggle — the operation the TMX surface performs', () => {
    seedStaff([{ name: 'desk', mobileTelephone: '+1 555 0100', isPublic: true }]);
    expect(readContacts()[0].isPublic).toEqual(true); // control

    tournamentEngine.modifyParticipant({
      participant: {
        participantId: STAFF_ID,
        person: { contacts: [{ name: 'desk', mobileTelephone: '+1 555 0100', isPublic: false }] },
      },
    });
    expect(readContacts()[0].isPublic).toEqual(false);
  });

  it('leaves an existing list untouched when contacts is omitted', () => {
    // The "consumers send the whole person object on every save" contract: a field they do not manage
    // must survive. A name edit must not silently drop the phone numbers.
    seedStaff([{ name: 'desk', mobileTelephone: '+1 555 0100', isPublic: true }]);

    tournamentEngine.modifyParticipant({
      participant: { participantId: STAFF_ID, person: { standardGivenName: 'Rachel' } },
    });

    expect(readContacts()).toHaveLength(1);
    expect(readContacts()[0].mobileTelephone).toEqual('+1 555 0100');
  });

  it('clears the list when an empty array is supplied', () => {
    seedStaff([{ name: 'desk', mobileTelephone: '+1 555 0100' }]);
    expect(readContacts()).toHaveLength(1); // control

    tournamentEngine.modifyParticipant({ participant: { participantId: STAFF_ID, person: { contacts: [] } } });
    expect(readContacts()).toHaveLength(0);
  });

  it('replaces rather than merges, so a contact can be removed', () => {
    seedStaff([
      { name: 'desk', mobileTelephone: '+1 555 0100' },
      { name: 'mobile', mobileTelephone: '+1 555 0199' },
    ]);
    expect(readContacts()).toHaveLength(2); // control

    tournamentEngine.modifyParticipant({
      participant: {
        participantId: STAFF_ID,
        person: { contacts: [{ name: 'desk', mobileTelephone: '+1 555 0100' }] },
      },
    });

    const contacts = readContacts();
    expect(contacts).toHaveLength(1);
    expect(contacts.some((c: any) => c.name === 'mobile')).toEqual(false);
  });
});
