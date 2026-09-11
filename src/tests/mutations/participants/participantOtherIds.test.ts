import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { PAIR, TEAM, INDIVIDUAL } from '@Constants/participantConstants';
import { UnifiedParticipantID } from '@Types/tournamentTypes';

/**
 * `participantOtherIds` is the participant-grain member of the `Unified*ID` family. It
 * exists because `personOtherIds` cannot cover every competitor: it hangs off
 * `participant.person`, and a PAIR or TEAM participant has no `person` at all — so a pair
 * or team registered with an outside body had nowhere to record that body's id for it.
 *
 * These assert the field SURVIVES a round trip at every grain. A type slot the engine
 * strips on write would be worse than no slot, because it would look like it worked.
 */
describe('participantOtherIds', () => {
  const itaId: UnifiedParticipantID = {
    organisationId: 'ITA',
    uniqueOrganisationName: 'Intercollegiate Tennis Association',
    participantId: 'ita-entry-771',
  };

  it('round-trips on an INDIVIDUAL participant', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const target = tournamentRecord.participants?.[0];

    let result: any = tournamentEngine.addParticipants({
      participants: [
        {
          participantId: 'individual-with-other-id',
          participantType: INDIVIDUAL,
          participantRole: 'COMPETITOR',
          person: { standardFamilyName: 'Sampras', standardGivenName: 'Pete' },
          participantOtherIds: [itaId],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId: 'individual-with-other-id' });
    expect(result.participant.participantOtherIds).toEqual([itaId]);
    // and it is independent of personOtherIds, which remains the person-grain slot
    expect(result.participant.person?.personOtherIds).toBeUndefined();
    expect(target).toBeDefined();
  });

  // The case the field exists for: a PAIR carries no `person`, so personOtherIds cannot
  // reach it. Before this field a registered pair's sanctioning id had nowhere to live.
  it('round-trips on a PAIR participant, which has no person to hang personOtherIds from', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const individualParticipantIds = (tournamentRecord.participants ?? []).map((p: any) => p.participantId);

    let result: any = tournamentEngine.addParticipants({
      participants: [
        {
          participantId: 'pair-with-other-id',
          participantType: PAIR,
          participantRole: 'COMPETITOR',
          individualParticipantIds,
          participantOtherIds: [itaId],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId: 'pair-with-other-id' });
    expect(result.participant.participantType).toEqual(PAIR);
    expect(result.participant.person).toBeUndefined(); // the whole reason the field is needed
    expect(result.participant.participantOtherIds).toEqual([itaId]);
  });

  it('round-trips on a TEAM participant', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const individualParticipantIds = (tournamentRecord.participants ?? []).map((p: any) => p.participantId);

    let result: any = tournamentEngine.addParticipants({
      participants: [
        {
          participantId: 'team-with-other-id',
          participantType: TEAM,
          participantRole: 'COMPETITOR',
          participantName: 'Georgia Bulldogs',
          individualParticipantIds,
          participantOtherIds: [itaId],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId: 'team-with-other-id' });
    expect(result.participant.person).toBeUndefined();
    expect(result.participant.participantOtherIds).toEqual([itaId]);
  });

  // Several organisations may know the same participant — the sanctioning origin plus any
  // id acquired by copy-back. The array grain is what makes that expressible.
  it('carries entries from several organisations at once', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
    const ustaId: UnifiedParticipantID = { organisationId: 'USTA', participantId: 'usta-entry-3' };

    let result: any = tournamentEngine.addParticipants({
      participants: [
        {
          participantId: 'multi-org-participant',
          participantType: INDIVIDUAL,
          participantRole: 'COMPETITOR',
          person: { standardFamilyName: 'Agassi', standardGivenName: 'Andre' },
          participantOtherIds: [itaId, ustaId],
        },
      ],
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId: 'multi-org-participant' });
    expect(result.participant.participantOtherIds).toHaveLength(2);
    expect(result.participant.participantOtherIds.map((o: any) => o.organisationId)).toEqual(['ITA', 'USTA']);
  });
});

/**
 * `addParticipantOtherId` is the append/upsert path — the participant-grain sibling of
 * `addPersonOtherId`, which refuses every non-INDIVIDUAL type because it writes to
 * `participant.person`. Copy-back needs this: an id acquired AFTER the participant exists
 * has no other way in, since `modifyParticipant` carries a closed attribute allow-list.
 */
describe('addParticipantOtherId', () => {
  function pairSetup() {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const individualParticipantIds = (tournamentRecord.participants ?? []).map((p: any) => p.participantId);
    tournamentEngine.addParticipants({
      participants: [
        {
          participantId: 'pair-1',
          participantType: PAIR,
          participantRole: 'COMPETITOR',
          individualParticipantIds,
        },
      ],
    });
    return { individualParticipantId: individualParticipantIds[0] };
  }

  it('appends to a PAIR — the case addPersonOtherId cannot serve', () => {
    pairSetup();

    // the person-grain mutation refuses, naming the reason
    let result: any = tournamentEngine.addPersonOtherId({
      participantId: 'pair-1',
      organisationId: 'ITA',
      personId: 'ita-p-1',
    });
    expect(result.error).toBeDefined();

    // the participant-grain mutation accepts
    result = tournamentEngine.addParticipantOtherId({
      participantId: 'pair-1',
      organisationId: 'ITA',
      otherParticipantId: 'ita-entry-771',
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds).toHaveLength(1);
    expect(result.participant.participantOtherIds[0].participantId).toEqual('ita-entry-771');
    expect(result.participant.participantOtherIds[0].createdAt).toBeDefined();
  });

  it('upserts by organisationId and is idempotent on an unchanged pair', () => {
    pairSetup();
    const add = (otherParticipantId: string) =>
      tournamentEngine.addParticipantOtherId({ participantId: 'pair-1', organisationId: 'ITA', otherParticipantId });

    expect(add('ita-1').success).toEqual(true);
    expect(add('ita-1').success).toEqual(true); // idempotent — no second entry, no updatedAt
    let result: any = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds).toHaveLength(1);
    expect(result.participant.participantOtherIds[0].updatedAt).toBeUndefined();

    expect(add('ita-2').success).toEqual(true); // same org, new id → replace in place
    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds).toHaveLength(1);
    expect(result.participant.participantOtherIds[0].participantId).toEqual('ita-2');
    expect(result.participant.participantOtherIds[0].updatedAt).toBeDefined();

    // a DIFFERENT org appends rather than replacing
    expect(
      tournamentEngine.addParticipantOtherId({
        participantId: 'pair-1',
        organisationId: 'USTA',
        otherParticipantId: 'usta-9',
      }).success,
    ).toEqual(true);
    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds).toHaveLength(2);
  });

  it('carries uniqueOrganisationName on append and refreshes it on update', () => {
    pairSetup();
    let result: any = tournamentEngine.addParticipantOtherId({
      participantId: 'pair-1',
      organisationId: 'ITA',
      otherParticipantId: 'ita-1',
      uniqueOrganisationName: 'Intercollegiate Tennis Association',
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds[0].uniqueOrganisationName).toEqual(
      'Intercollegiate Tennis Association',
    );

    // same org, new id + renamed organisation → both refresh in place
    expect(
      tournamentEngine.addParticipantOtherId({
        participantId: 'pair-1',
        organisationId: 'ITA',
        otherParticipantId: 'ita-2',
        uniqueOrganisationName: 'ITA (renamed)',
      }).success,
    ).toEqual(true);
    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds).toHaveLength(1);
    expect(result.participant.participantOtherIds[0].uniqueOrganisationName).toEqual('ITA (renamed)');

    // omitting it on a later update leaves the existing name rather than clearing it
    expect(
      tournamentEngine.addParticipantOtherId({
        participantId: 'pair-1',
        organisationId: 'ITA',
        otherParticipantId: 'ita-3',
      }).success,
    ).toEqual(true);
    result = tournamentEngine.findParticipant({ participantId: 'pair-1' });
    expect(result.participant.participantOtherIds[0].uniqueOrganisationName).toEqual('ITA (renamed)');
  });

  it('validates its inputs and an unknown participant', () => {
    pairSetup();
    expect(
      tournamentEngine.addParticipantOtherId({ participantId: 'pair-1', otherParticipantId: 'x' }).error,
    ).toBeDefined();
    expect(
      tournamentEngine.addParticipantOtherId({ participantId: 'pair-1', organisationId: 'ITA' }).error,
    ).toBeDefined();
    expect(
      tournamentEngine.addParticipantOtherId({
        participantId: 'no-such-participant',
        organisationId: 'ITA',
        otherParticipantId: 'x',
      }).error,
    ).toBeDefined();
  });
});
