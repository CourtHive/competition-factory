import { getParticipation } from '@Query/participants/getParticipation';
import { mocksEngine } from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';

const issuedTeam = (participantId: string, issuedId: string, organisationId = ORG) => ({
  participantId,
  participantType: TEAM,
  participantName: `Team ${issuedId}`,
  participantOtherIds: [{ organisationId, participantId: issuedId }],
});

const issuedPerson = (participantId: string, issuedId: string) => ({
  participantId,
  participantType: INDIVIDUAL,
  participantName: `Person ${issuedId}`,
  person: { personId: `p-${participantId}`, personOtherIds: [{ organisationId: ORG, personId: issuedId }] },
});

const record = (participants: any[]): any => ({
  tournamentId: 't-1',
  tournamentName: 'A vs B',
  startDate: '2026-03-28',
  endDate: '2026-03-28',
  parentOrganisation: { organisationId: 'prov-1' },
  events: [{ eventId: 'e-1' }],
  participants,
});

describe('getParticipation', () => {
  it('reports BOTH sides of a fixture — the relation a calendar cannot express', () => {
    // A record lives in exactly one provider's calendar, so ownership can name only one side.
    // If this returned one entry, a visiting competitor's away fixtures would simply be absent.
    const result: any = getParticipation({
      tournamentRecord: record([issuedTeam('local-a', 'A'), issuedTeam('local-b', 'B')]),
    });
    expect(result.map((entry) => entry.subjectId).sort((a, b) => a.localeCompare(b, 'en'))).toEqual(['A', 'B']);
    expect(result.every((entry) => entry.subjectType === 'TEAM')).toEqual(true);
  });

  it('keys the subject on the ISSUED id and keeps the local id separately', () => {
    const result: any = getParticipation({ tournamentRecord: record([issuedTeam('local-a', 'A')]) });
    expect(result[0].subjectId).toEqual('A');
    expect(result[0].participantId).toEqual('local-a');
    expect(result[0].organisationId).toEqual(ORG);
  });

  it('derives PERSON subjects from person.personOtherIds', () => {
    const result: any = getParticipation({ tournamentRecord: record([issuedPerson('local-p', 'P1')]) });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ subjectType: 'PERSON', subjectId: 'P1', participantId: 'local-p' });
  });

  it('reports TEAM and PERSON from one record, each at its own grain', () => {
    const result: any = getParticipation({
      tournamentRecord: record([issuedTeam('local-a', 'A'), issuedPerson('local-p', 'P1')]),
    });
    expect(result.filter((entry) => entry.subjectType === 'TEAM')).toHaveLength(1);
    expect(result.filter((entry) => entry.subjectType === 'PERSON')).toHaveLength(1);
  });

  it('yields one entry PER ISSUING ORGANISATION, because each is a distinct identity claim', () => {
    const twiceIssued: any = issuedTeam('local-a', 'A');
    twiceIssued.participantOtherIds.push({ organisationId: OTHER_ORG, participantId: 'A-alt' });
    const result: any = getParticipation({ tournamentRecord: record([twiceIssued]) });
    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.organisationId).sort((a, b) => a.localeCompare(b, 'en'))).toEqual([
      ORG,
      OTHER_ORG,
    ]);
  });

  it('contributes NO entry for a competitor stating no issued id', () => {
    // A recorded gap. Falling back to the tournament-local participantId would manufacture a subject
    // that joins to nothing and looks exactly like a real one.
    const result: any = getParticipation({
      tournamentRecord: record([
        { participantId: 'local-x', participantType: TEAM, participantName: 'X' },
        issuedTeam('local-b', 'B'),
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].subjectId).toEqual('B');
  });

  it('contributes no entry for a MALFORMED issued id, and does not fall back to the local one', () => {
    // Distinct from "no participantOtherIds at all": here the record CLAIMS an issued identity and
    // fails to state it. A `?? participantId` fallback would look reasonable and would silently mint
    // a tournament-local subject — the precise failure this function is shaped to avoid.
    const malformed: any = {
      participantId: 'local-a',
      participantType: TEAM,
      participantOtherIds: [{ organisationId: ORG }],
    };
    expect(getParticipation({ tournamentRecord: record([malformed]) })).toEqual([]);

    const malformedPerson: any = {
      participantId: 'local-p',
      participantType: INDIVIDUAL,
      person: { personId: 'p-1', personOtherIds: [{ organisationId: ORG }] },
    };
    expect(getParticipation({ tournamentRecord: record([malformedPerson]) })).toEqual([]);
  });

  it('carries what a history renders from, so reading one needs no record load', () => {
    const result: any = getParticipation({ tournamentRecord: record([issuedTeam('local-a', 'A')]) });
    expect(result[0]).toMatchObject({
      tournamentId: 't-1',
      tournamentName: 'A vs B',
      startDate: '2026-03-28',
      endDate: '2026-03-28',
      eventCount: 1,
      providerId: 'prov-1',
    });
  });

  it('does not duplicate a competitor entered twice under one issued id', () => {
    const duplicated: any = issuedTeam('local-a', 'A');
    duplicated.participantOtherIds.push({ organisationId: ORG, participantId: 'A' });
    expect(getParticipation({ tournamentRecord: record([duplicated]) })).toHaveLength(1);
  });

  it('ignores participant types that carry no issued identity of their own', () => {
    const withPair: any = record([issuedTeam('local-a', 'A')]);
    withPair.participants.push({ participantId: 'pair-1', participantType: 'PAIR' });
    expect(getParticipation({ tournamentRecord: withPair })).toHaveLength(1);
  });

  it('returns nothing rather than throwing on partial or absent input', () => {
    expect(getParticipation({ tournamentRecord: { participants: [] } as any })).toEqual([]);
    expect(getParticipation({ tournamentRecord: { tournamentId: 't' } as any })).toEqual([]);
    expect(getParticipation({ tournamentRecord: undefined as any })).toEqual([]);
    expect(getParticipation({ tournamentRecord: record([]) })).toEqual([]);
  });

  it('counts events and omits a provider the record does not name', () => {
    const noProvider: any = record([issuedTeam('local-a', 'A')]);
    delete noProvider.parentOrganisation;
    noProvider.events = [{ eventId: 'e-1' }, { eventId: 'e-2' }];
    const result: any = getParticipation({ tournamentRecord: noProvider });
    expect(result[0].eventCount).toEqual(2);
    expect(result[0].providerId).toBeUndefined();
  });

  it('reads a GENERATED record without inventing subjects for it', () => {
    // The factory's own participants carry no issued ids, so an honest derivation finds none here.
    // This is the guard against a future fallback to participantId: the moment one is added, this
    // record starts producing subjects that cannot join to anything and this test fails.
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 8 },
      drawProfiles: [{ drawSize: 8 }],
    });
    expect(tournamentRecord.participants.length).toBeGreaterThan(0);
    expect(getParticipation({ tournamentRecord })).toEqual([]);
  });
});
