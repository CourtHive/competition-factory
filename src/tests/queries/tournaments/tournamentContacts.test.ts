import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { ADMINISTRATION, COMPETITOR, DIRECTOR, OFFICIAL } from '@Constants/participantRoles';

/**
 * `tournamentContacts` is the tournament's public "who to contact" list. It carried names and roles and
 * **no contact details** — POLICY_PRIVACY_STAFF stripped `contacts` at both the participant and person
 * level, so a field named "contacts" published none — and it excluded the tournament DIRECTOR by role,
 * i.e. the one person a competitor most needs to reach.
 *
 * Which contacts publish is gated on `Contact.isPublic === true`, applied as a predicate in
 * `getTournamentInfo` rather than in the policy template. A template array is an allow-list, but
 * `attributeFilter` only evaluates it for keys the source actually has, so a contact with no `isPublic`
 * would pass unexamined. Absent must withhold — nothing writes the flag today, so fail-open would
 * publish every contact in existence.
 */

const contact = (name: string, isPublic?: boolean) => ({
  ...(isPublic === undefined ? {} : { isPublic }),
  mobileTelephone: `+33 6 00 00 00 0${name.length}`,
  emailAddress: `${name}@example.org`,
  name,
});

function seed({ role, contacts }: { role: string; contacts: any[] }) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true, nonRandom: 1 });
  tournamentEngine.addParticipants({
    participants: [
      {
        person: {
          standardGivenName: 'Dana',
          standardFamilyName: 'Director',
          nationalityCode: 'FRA',
          birthDate: '1970-05-05',
          personId: 'national-id-12345',
          sex: 'FEMALE',
          contacts,
        },
        participantName: 'Dana Director',
        participantType: 'INDIVIDUAL',
        participantId: 'staff-1',
        participantRole: role,
      },
    ],
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  return tournamentRecord;
}

const contactsOf = (tournamentRecord: any, policyDefinitions?: any) => {
  const { tournamentInfo }: any = getTournamentInfo({ tournamentRecord, policyDefinitions });
  const entry = (tournamentInfo?.tournamentContacts ?? []).find((c: any) => c.participantId === 'staff-1');
  return { entry, all: tournamentInfo?.tournamentContacts ?? [] };
};

describe('tournamentContacts', () => {
  it('includes the tournament DIRECTOR — previously excluded by role', () => {
    const tournamentRecord = seed({ role: DIRECTOR, contacts: [contact('desk', true)] });
    const { entry } = contactsOf(tournamentRecord);
    expect(entry).toBeDefined();
    expect(entry.participantRole).toEqual(DIRECTOR);
  });

  it('publishes the contact details of a public contact', () => {
    const tournamentRecord = seed({ role: OFFICIAL, contacts: [contact('desk', true)] });
    const { entry } = contactsOf(tournamentRecord);
    const published = entry.person.contacts;
    expect(published).toHaveLength(1);
    expect(published[0].mobileTelephone).toBeDefined();
    expect(published[0].emailAddress).toBeDefined();
  });

  it('withholds a contact marked isPublic: false', () => {
    const tournamentRecord = seed({ role: OFFICIAL, contacts: [contact('private', false)] });
    const { entry } = contactsOf(tournamentRecord);
    expect(entry.person.contacts).toHaveLength(0);
  });

  it('withholds a contact with NO isPublic — absent must not mean public', () => {
    // The fail-open case. `attributeFilter` cannot express this: it never examines a key the source
    // lacks, so the allow-list form would let this through.
    const tournamentRecord = seed({ role: OFFICIAL, contacts: [contact('unset')] });
    const { entry } = contactsOf(tournamentRecord);
    expect(entry.person.contacts).toHaveLength(0);
  });

  it('publishes only the public contacts when a person has several', () => {
    const tournamentRecord = seed({
      role: ADMINISTRATION,
      contacts: [contact('desk', true), contact('private', false), contact('unset')],
    });
    const { entry } = contactsOf(tournamentRecord);
    // Control: the record carried three; exactly one opted in.
    expect(entry.person.contacts).toHaveLength(1);
    expect(entry.person.contacts[0].name).toEqual('desk');
  });

  it('still strips birthDate, personId and sex — permitting contacts widened nothing else', () => {
    const tournamentRecord = seed({ role: DIRECTOR, contacts: [contact('desk', true)] });
    const { entry } = contactsOf(tournamentRecord);
    expect(entry.person.birthDate).toBeUndefined();
    expect(entry.person.personId).toBeUndefined();
    expect(entry.person.sex).toBeUndefined();
    // …while the attributes the list exists to carry are present.
    expect(entry.person.standardFamilyName).toEqual('Director');
  });

  it('never includes COMPETITORs', () => {
    const tournamentRecord = seed({ role: COMPETITOR, contacts: [contact('desk', true)] });
    const { all } = contactsOf(tournamentRecord);
    expect(all.some((c: any) => c.participantId === 'staff-1')).toEqual(false);
  });

  it('honours a caller-supplied policy over the bundled staff policy', () => {
    // The override that makes "providers author their own privacy policies" true on this path.
    const tournamentRecord = seed({ role: DIRECTOR, contacts: [contact('desk', true)] });
    const strict = {
      participant: {
        participant: { participantId: true, participantName: true, participantRole: true, person: { contacts: false } },
      },
    };
    const { entry } = contactsOf(tournamentRecord, strict);
    expect(entry).toBeDefined();
    expect(entry.person?.contacts).toBeUndefined();
  });
});
