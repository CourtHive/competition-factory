import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { MISSING_VALUE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';

function setup() {
  let result: any = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
    setState: true,
  });
  const participantId = result.tournamentRecord.participants[0].participantId;
  return { participantId };
}

describe('addPersonOtherId — append', () => {
  it('appends a new (organisationId, personId) to an empty array', () => {
    const { participantId } = setup();
    let result: any = tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'EXAMPLE_FEDERATION',
      personId: 'EX-12345',
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId });
    const otherIds = result.participant.person.personOtherIds;
    expect(otherIds).toHaveLength(1);
    expect(otherIds[0].organisationId).toEqual('EXAMPLE_FEDERATION');
    expect(otherIds[0].personId).toEqual('EX-12345');
    expect(otherIds[0].createdAt).toBeDefined();
  });

  it('appends a second entry under a different organisationId', () => {
    const { participantId } = setup();
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_A',
      personId: 'A-1',
    });
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_B',
      personId: 'B-2',
    });
    const result: any = tournamentEngine.findParticipant({ participantId });
    const otherIds = result.participant.person.personOtherIds;
    expect(otherIds).toHaveLength(2);
    expect(otherIds.map((o: any) => o.organisationId).sort()).toEqual(['FED_A', 'FED_B']);
  });
});

describe('addPersonOtherId — upsert by organisationId', () => {
  it('replaces personId when organisationId already exists', () => {
    const { participantId } = setup();
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_X',
      personId: 'X-OLD',
    });
    let result: any = tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_X',
      personId: 'X-NEW',
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.findParticipant({ participantId });
    const otherIds = result.participant.person.personOtherIds;
    expect(otherIds).toHaveLength(1);
    expect(otherIds[0].organisationId).toEqual('FED_X');
    expect(otherIds[0].personId).toEqual('X-NEW');
    expect(otherIds[0].updatedAt).toBeDefined();
  });

  it('does not duplicate when same (organisationId, personId) is re-applied', () => {
    const { participantId } = setup();
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_Y',
      personId: 'Y-1',
    });
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_Y',
      personId: 'Y-1',
    });
    const result: any = tournamentEngine.findParticipant({ participantId });
    expect(result.participant.person.personOtherIds).toHaveLength(1);
  });
});

describe('addPersonOtherId — error paths', () => {
  it('returns PARTICIPANT_NOT_FOUND when participantId is unknown', () => {
    setup();
    const result: any = tournamentEngine.addPersonOtherId({
      participantId: 'no-such-participant',
      organisationId: 'FED_Z',
      personId: 'Z-1',
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('returns MISSING_VALUE when organisationId is empty', () => {
    const { participantId } = setup();
    const result: any = tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: '',
      personId: 'something',
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns MISSING_VALUE when personId is empty', () => {
    const { participantId } = setup();
    const result: any = tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_W',
      personId: '',
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });
});

describe('addPersonOtherId — mixed federations', () => {
  it('preserves existing entries from other organisations', () => {
    const { participantId } = setup();
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_KEEP',
      personId: 'KEEP-1',
    });
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'FED_NEW',
      personId: 'NEW-1',
    });
    const result: any = tournamentEngine.findParticipant({ participantId });
    const otherIds = result.participant.person.personOtherIds;
    expect(otherIds).toHaveLength(2);
    const keep = otherIds.find((o: any) => o.organisationId === 'FED_KEEP');
    expect(keep?.personId).toEqual('KEEP-1');
  });
});
