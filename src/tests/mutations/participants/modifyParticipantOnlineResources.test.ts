import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

/**
 * A participant's own `onlineResources` are checked against the CODES OnlineResource, as `person.onlineResources`
 * are: `resourceType` is one of OnlineResourceTypeEnum and an attribute CODES does not define is refused. A list
 * equal to the stored one is never refused, so a record that already holds a non-CODES key can still be re-saved.
 */

const URL_RESOURCE = {
  resourceType: 'URL',
  resourceSubType: 'PROFILE',
  name: 'profile',
  identifier: 'https://x.org/1',
};
// the shape an older client import wrote: the type under `resource`, which is not a CODES attribute
const LEGACY_RESOURCE = { resource: 'URL', resourceSubType: 'PROFILE', name: 'profile', identifier: 'https://x.org/1' };

function setup(onlineResources?: any[]) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 2 }, setState: true });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const record = tournamentRecord.participants.find(({ participantType }) => participantType === INDIVIDUAL);
  if (onlineResources) {
    record.onlineResources = onlineResources;
    tournamentEngine.setState(tournamentRecord);
  }
  return record.participantId;
}

function stored(participantId: string) {
  return tournamentEngine.getTournament().tournamentRecord.participants.find((p) => p.participantId === participantId);
}

describe('participant onlineResources follow the CODES OnlineResource', () => {
  it('writes a list of CODES online resources', () => {
    const participantId = setup();
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, onlineResources: [URL_RESOURCE] },
    });
    expect(result.success).toEqual(true);
    expect(stored(participantId).onlineResources).toEqual([URL_RESOURCE]);
  });

  const refused: [string, unknown, string][] = [
    ['a `resource` key in place of resourceType', [LEGACY_RESOURCE], 'onlineResources[0].resource'],
    [
      'a resourceType outside the enum',
      [{ ...URL_RESOURCE, resourceType: 'TELEGRAPH' }],
      'onlineResources[0].resourceType',
    ],
    ['an identifier that is not a string', [{ ...URL_RESOURCE, identifier: 7 }], 'onlineResources[0].identifier'],
    ['an entry that is not an object', ['https://x.org/1'], 'onlineResources[0]'],
    ['a value that is not a list', URL_RESOURCE, 'onlineResources'],
  ];

  it.each(refused)('refuses %s, writing nothing', (_description, onlineResources, field) => {
    const participantId = setup();
    const before = stored(participantId);
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, participantOtherName: 'Changed', onlineResources },
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.field).toEqual(field);
    expect(stored(participantId)).toEqual(before);
  });
});

describe('a stored list with a non-CODES key', () => {
  it('is not refused when it is sent back unchanged, with the whole participant', () => {
    const participantId = setup([LEGACY_RESOURCE]);
    const whole = tournamentEngine.getParticipants({ participantFilters: { participantIds: [participantId] } })
      .participants[0];
    const result: any = tournamentEngine.modifyParticipant({ participant: { ...whole, participantOtherName: 'Z' } });
    expect(result.success).toEqual(true);
    expect(stored(participantId).participantOtherName).toEqual('Z');
    expect(stored(participantId).onlineResources).toEqual([LEGACY_RESOURCE]);
  });

  it('is replaced by a CODES list', () => {
    const participantId = setup([LEGACY_RESOURCE]);
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, onlineResources: [URL_RESOURCE] },
    });
    expect(result.success).toEqual(true);
    expect(stored(participantId).onlineResources).toEqual([URL_RESOURCE]);
  });

  it('is refused when the list changes and still carries the non-CODES entry', () => {
    const participantId = setup([LEGACY_RESOURCE]);
    const added = { ...URL_RESOURCE, identifier: 'https://x.org/2' };
    const result: any = tournamentEngine.modifyParticipant({
      participant: { participantId, onlineResources: [LEGACY_RESOURCE, added] },
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.field).toEqual('onlineResources[0].resource');
    expect(stored(participantId).onlineResources).toEqual([LEGACY_RESOURCE]);
  });
});
