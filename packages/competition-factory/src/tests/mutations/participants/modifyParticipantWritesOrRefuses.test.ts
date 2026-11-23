import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import {
  NATIONALITY_CODE_UNRECOGNIZED,
  INVALID_PARTICIPANT_TYPE,
  INVALID_PARTICIPANT_IDS,
  PARTICIPANT_NOT_FOUND,
  INVALID_VALUES,
  INVALID_DATE,
} from '@Constants/errorConditionConstants';

/**
 * `modifyParticipant` WRITES or REFUSES every attribute it is given; none is accepted and dropped (CA 2026-11-02).
 * A value equal to the stored one is never refused, because consumers send the whole participant on every save.
 */

const CURRENT_YEAR = new Date().getFullYear();

function setup() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 6, participantType: PAIR },
    setState: true,
  });
  const participants = tournamentEngine.getParticipants().participants;
  const individuals = participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  const pairs = participants.filter(({ participantType }) => participantType === PAIR);
  return { individual: individuals[0], individuals, pair: pairs[0] };
}

function stored(participantId: string) {
  return tournamentEngine.getTournament().tournamentRecord.participants.find((p) => p.participantId === participantId);
}

function modify(participant: any, params: any = {}) {
  return tournamentEngine.modifyParticipant({ participant, ...params });
}

const personValues = {
  nativeFamilyName: '山田',
  nativeGivenName: '太郎',
  passportFamilyName: 'YAMADA',
  passportGivenName: 'TARO',
  otherNames: ['Taro Y'],
  previousNames: ['Taro Suzuki'],
  addresses: [{ addressType: 'HOME', city: 'Osaka', countryCode: 'JPN', postalCode: '530-0001', latitude: 34.7 }],
  biographicalInformation: {
    playingHand: 'RIGHT',
    doublePlayingHand: 'BACKHAND',
    height: 180,
    heightUnit: 'CENTIMETER',
    birthCountryCode: 'JPN',
    organisationIds: ['org-1'],
    teamAttributes: [{ teamName: 'Osaka', jerseyNumber: '7', captain: true }],
  },
  birthYear: 1999,
  onlineResources: [{ resourceType: 'URL', identifier: 'https://example.org/taro', name: 'profile' }],
  wheelchair: true,
  parentOrganisationId: 'parent-org',
  sectionId: 'section-1',
  status: 'ACTIVE',
  notes: 'left-handed coach',
  tennisId: 'T-1',
};

describe('person attributes that had no write path', () => {
  it.each(Object.entries(personValues))('writes and clears person.%s', (field, value) => {
    const { individual } = setup();

    let result: any = modify({ participantId: individual.participantId, person: { [field]: value } });
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();
    expect(stored(individual.participantId).person[field]).toEqual(value);
    // the rest of the person is untouched
    expect(stored(individual.participantId).person.standardFamilyName).toEqual(individual.person.standardFamilyName);

    result = modify({ participantId: individual.participantId, person: { [field]: '' } });
    expect(result.success).toEqual(true);
    expect(Object.keys(stored(individual.participantId).person)).not.toContain(field);
  });

  it('writes them all at once, and an empty list or object also clears', () => {
    const { individual } = setup();
    let result: any = modify({ participantId: individual.participantId, person: personValues });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).person).toMatchObject(personValues);

    result = modify({
      participantId: individual.participantId,
      person: { otherNames: [], addresses: [], biographicalInformation: {} },
    });
    expect(result.success).toEqual(true);
    const person = stored(individual.participantId).person;
    expect(person.otherNames).toBeUndefined();
    expect(person.addresses).toBeUndefined();
    expect(person.biographicalInformation).toBeUndefined();
    // an attribute the call does not mention is untouched
    expect(person.previousNames).toEqual(personValues.previousNames);
  });

  it('writes participant notes as a string, and clears them', () => {
    const { individual } = setup();
    let result: any = modify({ participantId: individual.participantId, notes: 'arrives Tuesday' });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).notes).toEqual('arrives Tuesday');
    result = modify({ participantId: individual.participantId, notes: '' });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).notes).toBeUndefined();
  });

  it('clears a name with an empty string and re-derives participantName', () => {
    const { individual } = setup();
    const result: any = modify({ participantId: individual.participantId, person: { standardGivenName: '' } });
    expect(result.success).toEqual(true);
    const participant = stored(individual.participantId);
    expect(participant.person.standardGivenName).toBeUndefined();
    expect(participant.participantName).toEqual(individual.person.standardFamilyName);
  });

  it('clears tennisId with an empty string', () => {
    const { individual } = setup();
    modify({ participantId: individual.participantId, person: { tennisId: 'T-9' } });
    const result: any = modify({ participantId: individual.participantId, person: { tennisId: '' } });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).person.tennisId).toBeUndefined();
  });
});

const invalidPersonValues: [string, unknown][] = [
  ['nationalityCode', 7],
  ['standardFamilyName', 'A'],
  ['standardGivenName', ' B '],
  ['standardFamilyName', 42],
  ['tennisId', 12345],
  ['personId', ''],
  ['contacts', { emailAddress: 'a@b.c' }],
  ['nativeFamilyName', 5],
  ['status', false],
  ['birthYear', 1899],
  ['birthYear', CURRENT_YEAR + 1],
  ['birthYear', 1990.5],
  ['birthYear', '1990'],
  ['wheelchair', 'yes'],
  ['otherNames', 'Taro'],
  ['previousNames', ['ok', 3]],
  ['addresses', [{ city: 1 }]],
  ['addresses', [{ unknownKey: 'x' }]],
  ['addresses', [{ countryCode: 'ZZZ' }]],
  ['addresses', [{ addressType: 'CASTLE' }]],
  ['addresses', ['not an object']],
  ['biographicalInformation', { playingHand: 'BOTH' }],
  ['biographicalInformation', { height: 'tall' }],
  ['biographicalInformation', { teamAttributes: [{ captain: 'yes' }] }],
  ['biographicalInformation', { organisationIds: [1] }],
  ['biographicalInformation', ['not', 'an', 'object']],
  ['onlineResources', [{ resourceType: 'TELEGRAPH' }]],
  ['onlineResources', [{ resource: 'URL' }]],
  ['personOtherIds', [{ personId: 'x' }]],
  ['personOtherIds', [{ organisationId: 'org', personId: 7 }]],
];

const invalidParticipantValues: [string, unknown][] = [
  ['participantRole', 'BOGUS'],
  ['participantName', 7],
  ['participantName', '   '],
  ['notes', 5],
  ['contacts', { emailAddress: 'a@b.c' }],
  ['onlineResources', 'https://example.org'],
  ['participantRoleResponsibilities', [1]],
  ['timeItems', 'rating'],
  ['timeItems', [{ itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: 20, itemDate: 'not a date' }]],
];

describe('invalid values are refused before anything is written', () => {
  it.each(invalidPersonValues)('refuses person.%s = %j', (field, value) => {
    const { individual } = setup();
    const before = stored(individual.participantId);

    // sent beside valid changes, which must not be written either
    const result: any = modify({
      participantId: individual.participantId,
      participantOtherName: 'Changed',
      person: { status: 'CHANGED', [field]: value },
    });
    expect(result.success).toBeUndefined();
    expect(result.participant).toBeUndefined();
    expect(stored(individual.participantId)).toEqual(before);
    if (result.error.code === INVALID_VALUES.code) expect(result.context.field).toContain(field);
    else expect(result.error).toEqual(INVALID_DATE);
  });

  it.each(invalidParticipantValues)('refuses %s = %j', (field, value) => {
    const { individual } = setup();
    const before = stored(individual.participantId);

    const result: any = modify({
      participantId: individual.participantId,
      person: { status: 'CHANGED' },
      [field]: value,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.field).toContain(field);
    expect(stored(individual.participantId)).toEqual(before);
  });

  it('writes an unrecognised nationalityCode with a warning instead of refusing it', () => {
    const { individual } = setup();
    const result: any = modify({ participantId: individual.participantId, person: { nationalityCode: 'XKX' } });
    expect(result.success).toEqual(true);
    expect(result.warnings).toEqual([
      { ...NATIONALITY_CODE_UNRECOGNIZED, participantId: individual.participantId, nationalityCode: 'XKX' },
    ]);
    expect(stored(individual.participantId).person.nationalityCode).toEqual('XKX');
  });

  it('clears participantRole with an empty string and writes a valid one', () => {
    const { individual } = setup();
    let result: any = modify({ participantId: individual.participantId, participantRole: OFFICIAL });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).participantRole).toEqual(OFFICIAL);
    result = modify({ participantId: individual.participantId, participantRole: '' });
    expect(result.success).toEqual(true);
    expect(stored(individual.participantId).participantRole).toBeUndefined();
  });
});

describe('the whole participant, saved back', () => {
  it('succeeds unchanged, even when stored values would be refused as new ones', () => {
    const { individual } = setup();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const record = tournamentRecord.participants.find((p) => p.participantId === individual.participantId);
    // stored values a new write would refuse: legacy data must not block an unrelated edit
    Object.assign(record, {
      participantRole: 'LEGACY_ROLE',
      participantName: `Q ${record.person.standardFamilyName}`,
      extensions: [{ name: 'legacy', value: 1 }],
      penalties: [{ penaltyId: 'p1', penaltyType: 'BALL_ABUSE' }],
      participantOtherIds: [{ organisationId: 'org', participantId: 'x' }],
      timeItems: [{ itemType: 'CUSTOM.NOTE', itemValue: 'x' }],
      presence: [{ state: 'SIGNED_IN' }],
    });
    Object.assign(record.person, {
      standardGivenName: 'Q',
      tennisId: 9,
      birthYear: 1850,
      addresses: [{ legacyKey: true }],
      personOtherIds: [{ organisationId: 'org', personId: 'p' }],
      extensions: [{ name: 'legacy', value: 2 }],
    });
    tournamentEngine.setState(tournamentRecord);

    const before = stored(individual.participantId);
    const whole = tournamentEngine.getParticipants({
      participantFilters: { participantIds: [individual.participantId] },
    }).participants[0];
    const result: any = modify(whole);
    expect(result.success).toEqual(true);
    expect(result.warnings).toBeUndefined();

    const { updatedAt: _a, ...after } = stored(individual.participantId);
    const { updatedAt: _b, ...expected } = before;
    expect(after).toEqual(expected);
  });

  it('ignores metadata: isMock, createdAt, updatedAt, personId and teamId', () => {
    const { individual } = setup();
    const before = stored(individual.participantId);
    const result: any = modify({
      participantId: individual.participantId,
      isMock: !before.isMock,
      createdAt: '2001-01-01T00:00:00Z',
      updatedAt: '2001-01-01T00:00:00Z',
      personId: 'another-person',
      teamId: 'another-team',
    });
    expect(result.success).toEqual(true);
    const after = stored(individual.participantId);
    expect(after.isMock).toEqual(before.isMock);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.personId).toEqual(before.personId);
    expect(after.teamId).toEqual(before.teamId);
  });
});

describe('setter-owned attributes', () => {
  const refused: [string, unknown, string][] = [
    ['extensions', [{ name: 'x', value: 1 }], 'addParticipantExtension'],
    ['penalties', [{ penaltyId: 'p1', penaltyType: 'BALL_ABUSE' }], 'addPenalty'],
    ['presence', [{ state: 'SIGNED_IN' }], 'modifyParticipantsSignInStatus'],
    ['participantOtherIds', [{ organisationId: 'org', participantId: 'x' }], 'addParticipantOtherId'],
  ];

  it.each(refused)('refuses a changed %s, naming its setter', (field, value, setter) => {
    const { individual } = setup();
    const before = stored(individual.participantId);
    const result: any = modify({ participantId: individual.participantId, participantOtherName: 'x', [field]: value });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.field).toEqual(field);
    expect(result.context.setters).toContain(setter);
    expect(result.info).toContain(setter);
    expect(stored(individual.participantId)).toEqual(before);
  });

  it('refuses a changed person.extensions or person.timeItems: they have no write path', () => {
    const { individual } = setup();
    for (const field of ['extensions', 'timeItems']) {
      const result: any = modify({ participantId: individual.participantId, person: { [field]: [{ name: 'x' }] } });
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.context.field).toEqual(`person.${field}`);
    }
  });

  it('merges new ratings and rankings into timeItems, deleting nothing', () => {
    const { individual } = setup();
    let result: any = tournamentEngine.setParticipantScaleItem({
      participantId: individual.participantId,
      scaleItem: { scaleType: 'RATING', eventType: 'SINGLES', scaleName: 'WTN', scaleValue: { wtnRating: 20 } },
    });
    expect(result.success).toEqual(true);
    const held = stored(individual.participantId).timeItems;
    expect(held.length).toEqual(1);

    // a re-import: the held item, a new value for it, and a ranking it did not have
    const timeItems = [
      ...held,
      { itemType: 'SCALE.RATING.SINGLES.WTN', itemValue: { wtnRating: 18 } },
      { itemType: 'SCALE.RANKING.SINGLES.U18', itemValue: 4, itemDate: '2026-01-01' },
    ];
    result = modify({ participantId: individual.participantId, timeItems });
    expect(result.success).toEqual(true);
    let after = stored(individual.participantId).timeItems;
    expect(after.length).toEqual(3);
    expect(after[0]).toEqual(held[0]);
    expect(
      tournamentEngine.getParticipantScaleItem({
        participantId: individual.participantId,
        scaleAttributes: { scaleType: 'RATING', eventType: 'SINGLES', scaleName: 'WTN' },
      }).scaleItem.scaleValue,
    ).toEqual({ wtnRating: 18 });

    // sending the same value again, or a copy that omits items, adds and deletes nothing
    result = modify({ participantId: individual.participantId, timeItems: [timeItems[1]] });
    expect(result.success).toEqual(true);
    result = modify({ participantId: individual.participantId, timeItems: [] });
    expect(result.success).toEqual(true);
    after = stored(individual.participantId).timeItems;
    expect(after.length).toEqual(3);
  });

  it('refuses a new timeItem that is not a rating or ranking, naming addParticipantTimeItem', () => {
    const { individual } = setup();
    const result: any = modify({
      participantId: individual.participantId,
      timeItems: [{ itemType: 'CUSTOM.NOTE', itemValue: 'x' }],
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toContain('addParticipantTimeItem');
    expect(stored(individual.participantId).timeItems).toBeUndefined();
  });

  it('upserts person.personOtherIds by organisationId, falling back to uniqueOrganisationName', () => {
    const { individual } = setup();
    let result: any = tournamentEngine.addPersonOtherId({
      participantId: individual.participantId,
      organisationId: 'org-a',
      personId: 'A-1',
    });
    expect(result.success).toEqual(true);

    result = modify({
      participantId: individual.participantId,
      person: {
        personOtherIds: [
          { organisationId: 'org-b', personId: 'B-1' },
          { uniqueOrganisationName: 'FEDERATION', personId: 'F-1' },
        ],
      },
    });
    expect(result.success).toEqual(true);
    let ids = stored(individual.participantId).person.personOtherIds;
    // org-a is kept although the caller omitted it; a name-only entry stores the name as its organisationId
    expect(ids.map(({ organisationId, personId }) => [organisationId, personId])).toEqual([
      ['org-a', 'A-1'],
      ['org-b', 'B-1'],
      ['FEDERATION', 'F-1'],
    ]);
    expect(ids[2].uniqueOrganisationName).toEqual('FEDERATION');

    result = modify({
      participantId: individual.participantId,
      person: {
        personOtherIds: [
          { organisationId: 'org-a', personId: 'A-2' },
          { uniqueOrganisationName: 'FEDERATION', personId: 'F-2' },
        ],
      },
    });
    expect(result.success).toEqual(true);
    ids = stored(individual.participantId).person.personOtherIds;
    expect(ids.map(({ organisationId, personId }) => [organisationId, personId])).toEqual([
      ['org-a', 'A-2'],
      ['org-b', 'B-1'],
      ['FEDERATION', 'F-2'],
    ]);
  });
});

describe('groupings', () => {
  it('refuses an individualParticipantId that is not an individual of this tournament', () => {
    const { pair } = setup();
    const before = stored(pair.participantId);
    const result: any = modify({
      participantId: pair.participantId,
      individualParticipantIds: [pair.individualParticipantIds[0], 'nobody'],
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
    expect(result.invalid).toEqual(['nobody']);
    expect(stored(pair.participantId)).toEqual(before);
  });

  it('refuses a PAIR without exactly two members, unless pairOverride', () => {
    const { pair, individuals } = setup();
    const three = [
      ...pair.individualParticipantIds,
      individuals.find(({ participantId }) => !pair.individualParticipantIds.includes(participantId)).participantId,
    ];
    let result: any = modify({ participantId: pair.participantId, individualParticipantIds: three });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

    result = modify({ participantId: pair.participantId, individualParticipantIds: [three[0]] });
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

    result = modify(
      { participantId: pair.participantId, individualParticipantIds: [three[0]] },
      { pairOverride: true },
    );
    expect(result.success).toEqual(true);
    expect(stored(pair.participantId).individualParticipantIds).toEqual([three[0]]);
  });

  it('writes a PAIR membership change sent without participantType', () => {
    const { pair, individuals } = setup();
    const other = individuals.find(({ participantId }) => !pair.individualParticipantIds.includes(participantId));
    const members = [pair.individualParticipantIds[0], other.participantId];
    const result: any = modify({ participantId: pair.participantId, individualParticipantIds: members });
    expect(result.success).toEqual(true);
    expect(stored(pair.participantId).individualParticipantIds).toEqual(members);
  });

  it('refuses individualParticipantIds on an INDIVIDUAL', () => {
    const { individual, individuals } = setup();
    const result: any = modify({
      participantId: individual.participantId,
      individualParticipantIds: [individuals[1].participantId],
    });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
  });

  it('refuses a person sent on a participant that is not an INDIVIDUAL', () => {
    const { pair } = setup();
    const before = stored(pair.participantId);
    const result: any = modify({ participantId: pair.participantId, person: { standardFamilyName: 'Pair' } });
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
    expect(stored(pair.participantId)).toEqual(before);
  });

  it('checks groupingParticipantId before writing anything', () => {
    const { individual, pair } = setup();
    const before = stored(individual.participantId);

    let result: any = modify(
      { participantId: individual.participantId, participantOtherName: 'x' },
      { groupingParticipantId: 'nobody' },
    );
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
    expect(stored(individual.participantId)).toEqual(before);

    result = modify(
      { participantId: individual.participantId, participantOtherName: 'x' },
      { groupingParticipantId: pair.participantId },
    );
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
    expect(stored(individual.participantId)).toEqual(before);

    const teamId = 'team-osaka';
    result = tournamentEngine.addParticipant({
      participant: {
        participantId: teamId,
        participantType: TEAM,
        participantRole: COMPETITOR,
        participantName: 'Team Osaka',
      },
    });
    expect(result.success).toEqual(true);
    result = modify(
      { participantId: pair.participantId, participantOtherName: 'x' },
      { groupingParticipantId: teamId },
    );
    expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

    result = modify(
      { participantId: individual.participantId, participantOtherName: 'x' },
      { groupingParticipantId: teamId },
    );
    expect(result.success).toEqual(true);
    expect(stored(teamId).individualParticipantIds).toEqual([individual.participantId]);
  });
});
