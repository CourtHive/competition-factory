import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { ContactRelationshipEnum } from '@Types/tournamentTypes';
import { COMPETITOR, OTHER } from '@Constants/participantRoles';
import { INDIVIDUAL } from '@Constants/participantConstants';

/**
 * Two CODES additions and one cascade fix.
 *
 * `Contact.relationship` says WHOSE number this is. A minor's contact is routinely a parent, guardian or
 * chaperone, and a Contact could previously carry only a `name` — leaving the competitor's own mobile
 * indistinguishable from somebody else's.
 *
 * `Participant.contactParticipantIds` designates members who hold contact information for a grouping. A
 * pointer, not copied details: a copy is a snapshot that goes stale on a rename or a number change.
 *
 * A guardian is deliberately NOT a Participant. `addEventEntries` gates on participantType with no role
 * check, tournament counts filter on participantType, and rankings ingest walks all participants —
 * a guardian-as-participant would be draw-enterable, counted as a player, and given a ranking identity.
 */

const seedIndividuals = (count = 4) => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: count },
    setState: true,
    nonRandom: 1,
  });
  return tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map(({ participantId }: any) => participantId);
};

const readParticipant = (participantId: string) =>
  tournamentEngine.getParticipants({ participantFilters: { participantIds: [participantId] } }).participants?.[0];

describe('Contact.relationship', () => {
  it('persists a guardian contact with a name, distinct from the competitor', () => {
    const [competitorId] = seedIndividuals();

    const result: any = tournamentEngine.modifyParticipant({
      participant: {
        participantId: competitorId,
        person: {
          contacts: [
            { name: 'Ana Rivas', mobileTelephone: '+1 555 0100', relationship: ContactRelationshipEnum.GUARDIAN },
            { name: 'own mobile', mobileTelephone: '+1 555 0199', relationship: ContactRelationshipEnum.SELF },
          ],
        },
      },
    });
    expect(result.success).toEqual(true);

    const contacts = readParticipant(competitorId).person.contacts;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].relationship).toEqual('GUARDIAN');
    expect(contacts[0].name).toEqual('Ana Rivas');
    // SELF is the reason the enum carries it: without it this is indistinguishable from an unlabelled
    // number, and a director cannot tell whose phone they are about to ring.
    expect(contacts[1].relationship).toEqual('SELF');
  });

  it('carries PARENT and CHAPERONE, and tolerates a contact with no relationship', () => {
    const [competitorId] = seedIndividuals();
    tournamentEngine.modifyParticipant({
      participant: {
        participantId: competitorId,
        person: {
          contacts: [
            { name: 'dad', mobileTelephone: '+1 555 0001', relationship: ContactRelationshipEnum.PARENT },
            { name: 'team chaperone', mobileTelephone: '+1 555 0002', relationship: ContactRelationshipEnum.CHAPERONE },
            { name: 'unlabelled', mobileTelephone: '+1 555 0003' },
          ],
        },
      },
    });
    const contacts = readParticipant(competitorId).person.contacts;
    expect(contacts.map((c: any) => c.relationship)).toEqual(['PARENT', 'CHAPERONE', undefined]);
  });
});

describe('Participant.contactParticipantIds', () => {
  const seedGroup = () => {
    const ids = seedIndividuals();
    const created: any = tournamentEngine.createGroupParticipant({
      individualParticipantIds: ids.slice(0, 3),
      groupName: 'Coach Ramirez stable',
      participantRole: OTHER,
    });
    return { groupId: created.participant.participantId, ids };
  };

  it('designates members as the grouping contacts', () => {
    const { groupId, ids } = seedGroup();
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: groupId, contactParticipantIds: [ids[0], ids[1]] },
    });
    expect(result.success).toEqual(true);
    expect(readParticipant(groupId).contactParticipantIds).toEqual([ids[0], ids[1]]);
  });

  it('REFUSES a pointer to a non-member', () => {
    // Stale rather than authoritative: resolving it would advertise the contact details of somebody the
    // group does not contain. Refused on write instead of filtered on every read.
    const { groupId, ids } = seedGroup();
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId: groupId, contactParticipantIds: [ids[3]] },
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
    expect(readParticipant(groupId).contactParticipantIds).toBeUndefined();
  });

  it('validates against membership set in the SAME call', () => {
    // "Add these members and make one of them the contact" is a legitimate single mutation; validating
    // against the pre-call membership would reject it.
    const { groupId, ids } = seedGroup();
    const result: any = tournamentEngine.modifyParticipant({
      participant: {
        participantId: groupId,
        individualParticipantIds: [ids[0], ids[3]],
        contactParticipantIds: [ids[3]],
      },
    });
    expect(result.success).toEqual(true);
    expect(readParticipant(groupId).contactParticipantIds).toEqual([ids[3]]);
  });

  it('accepts an empty array as "no designated contact"', () => {
    const { groupId, ids } = seedGroup();
    tournamentEngine.modifyParticipant({ participant: { participantId: groupId, contactParticipantIds: [ids[0]] } });
    tournamentEngine.modifyParticipant({ participant: { participantId: groupId, contactParticipantIds: [] } });
    expect(readParticipant(groupId).contactParticipantIds).toEqual([]);
  });
});

describe('delete cascade reaches GROUPs', () => {
  it('removes a deleted participant from a role-bearing GROUP and its contact pointers', () => {
    // The F5 bug. `removeParticipantIdsFromAllTeams` filters groupings on
    // `participantRole === COMPETITOR || !participantRole`, and every GROUP the UI creates carries a
    // role — so no role-bearing GROUP was ever pruned. Dangling ids reach draw avoidance,
    // SHARED_GROUPING evaluation, membersCount and the public payload.
    const ids = seedIndividuals();
    const created: any = tournamentEngine.createGroupParticipant({
      individualParticipantIds: [ids[0], ids[1]],
      participantRole: OTHER,
      groupName: 'Squad',
    });
    const groupId = created.participant.participantId;
    tournamentEngine.modifyParticipant({
      participant: { participantId: groupId, contactParticipantIds: [ids[0]] },
    });
    // control: both the membership and the pointer are there to be pruned
    expect(readParticipant(groupId).individualParticipantIds).toEqual([ids[0], ids[1]]);
    expect(readParticipant(groupId).contactParticipantIds).toEqual([ids[0]]);

    const result: any = tournamentEngine.deleteParticipants({ participantIds: [ids[0]] });
    expect(result.success).toEqual(true);

    const group = readParticipant(groupId);
    expect(group.individualParticipantIds).toEqual([ids[1]]);
    expect(group.contactParticipantIds).toEqual([]);
  });

  it('still prunes TEAMs', () => {
    const ids = seedIndividuals();
    tournamentEngine.addParticipants({
      participants: [
        {
          individualParticipantIds: [ids[0], ids[1]],
          participantRole: COMPETITOR,
          participantId: 'team-1',
          participantName: 'Team One',
          participantType: 'TEAM',
        },
      ],
    });
    expect(readParticipant('team-1').individualParticipantIds).toHaveLength(2); // control

    tournamentEngine.deleteParticipants({ participantIds: [ids[0]] });
    expect(readParticipant('team-1').individualParticipantIds).toEqual([ids[1]]);
  });
});
