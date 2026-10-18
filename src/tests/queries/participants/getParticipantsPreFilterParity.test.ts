import { canPreFilter, getMissingParticipantIds } from '@Query/participants/getPreFilteredParticipants';
import { POLICY_PRIVACY_DEFAULT } from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { INDIVIDUAL, PAIR, SIGNED_IN, TEAM } from '@Constants/participantConstants';
import { DIRECT_ACCEPTANCE, UNPAIRED } from '@Constants/entryStatusConstants';
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { ParticipantFilters } from '@Types/factoryTypes';

// With returnParticipantMap: false, getParticipants builds only the participants its filters can keep. Every result
// must be what building the whole pool returned, so each call is made twice, with pre-filtering allowed and with it
// refused (what getParticipants did before), and the two whole results are compared.
let preFiltering = true;
vi.mock('@Query/participants/getPreFilteredParticipants', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, canPreFilter: vi.fn((params) => preFiltering && actual.canPreFilter(params)) };
});
const preFilterCalls = vi.mocked(canPreFilter);

afterEach(() => {
  preFiltering = true;
});

/**
 * A tournament with singles, doubles (with unpaired entries) and team events sharing one pool, officials (two with
 * role responsibilities), signed-in participants, unentered participants, and a pair naming a member no participant
 * holds (getParticipantMap reports it missing).
 */
function generate({ nonRandom, completeAllMatchUps }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 200, scaledParticipantsCount: 60 },
    eventProfiles: [
      { drawProfiles: [{ drawSize: 32, participantsCount: 28, alternatesCount: 2 }] },
      { eventType: DOUBLES, drawProfiles: [{ drawSize: 8 }] },
      { eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO, drawProfiles: [{ drawSize: 4 }] },
    ],
    completeAllMatchUps,
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);

  for (const [index, responsibilities] of [['REFEREE'], ['UMPIRE', 'REFEREE'], undefined].entries()) {
    const result = tournamentEngine.addParticipant({
      participant: {
        participantRoleResponsibilities: responsibilities,
        person: { standardFamilyName: `Official${index}`, standardGivenName: 'O', sex: index ? FEMALE : MALE },
        participantType: INDIVIDUAL,
        participantRole: OFFICIAL,
      },
    });
    expect(result.success).toEqual(true);
  }

  const participants = tournamentEngine.getTournament().tournamentRecord.participants;
  const individuals = participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  let result: any = tournamentEngine.modifyParticipantsSignInStatus({
    participantIds: individuals.slice(0, 10).map(({ participantId }) => participantId),
    signInState: SIGNED_IN,
  });
  expect(result.success).toEqual(true);

  // two new individuals, entered in the doubles event without a partner
  const doubles = tournamentRecord.events.find(({ eventType }) => eventType === DOUBLES);
  const unpaired = [0, 1].map((index) => {
    const added: any = tournamentEngine.addParticipant({
      participant: {
        person: { standardFamilyName: `Unpaired${index}`, standardGivenName: 'U', sex: MALE },
        participantType: INDIVIDUAL,
        participantRole: COMPETITOR,
      },
      returnParticipant: true,
    });
    expect(added.success).toEqual(true);
    return added.participant;
  });
  result = tournamentEngine.addEventEntries({
    participantIds: unpaired.map(({ participantId }) => participantId),
    eventId: doubles.eventId,
    entryStatus: UNPAIRED,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);

  // a record with a dangling member: added to the state directly, as an imported record would hold it
  const record = tournamentEngine.getTournament().tournamentRecord;
  record.participants.push({
    individualParticipantIds: [individuals[0].participantId, 'no-such-participant'],
    participantId: 'dangling-pair',
    participantRole: COMPETITOR,
    participantType: PAIR,
  });
  tournamentEngine.setState(record);
  return record;
}

function getFilters(tournamentRecord) {
  const someIds = tournamentRecord.participants.slice(5, 9).map(({ participantId }) => participantId);
  const doublesId = tournamentRecord.events.find(({ eventType }) => eventType === DOUBLES).eventId;
  return [
    { participantRoles: [OFFICIAL] },
    { participantRoles: [COMPETITOR] },
    { participantTypes: [PAIR] },
    { participantTypes: [TEAM] },
    { participantTypes: [INDIVIDUAL], participantRoles: [OFFICIAL] },
    { participantTypes: [] },
    { participantIds: someIds },
    { participantIds: [...someIds, 'dangling-pair'] },
    { genders: [MALE] },
    { signInStatus: SIGNED_IN },
    { eventIds: [doublesId] },
    { eventEntryStatuses: [DIRECT_ACCEPTANCE] },
    { eventEntryStatuses: [UNPAIRED] },
    { drawEntryStatuses: [DIRECT_ACCEPTANCE] },
    { positionedParticipants: true },
    { positionedParticipants: false },
    { participantRoleResponsibilities: ['REFEREE'] },
    { enableOrFiltering: true, participantRoles: [OFFICIAL], participantTypes: [PAIR] },
    { enableOrFiltering: true, genders: [FEMALE], signInStatus: SIGNED_IN },
    // accessorValues may read what only a built participant holds, so it is never applied to stored participants
    { accessorValues: [{ accessor: 'person.sex', value: FEMALE }] },
  ];
}

const OPTIONS: any[] = [
  {},
  { withIndividualParticipants: true },
  { withIndividualParticipants: { participantName: true } },
  { withEvents: true, withDraws: true },
  { withSeeding: true },
  { withScaleValues: true, withIOC: true, withISO2: true, withSignInStatus: true },
  { convertExtensions: true },
  { policyDefinitions: POLICY_PRIVACY_DEFAULT },
  { usePublishState: true, withEvents: true },
];

describe('getParticipants returns what building every participant returned', () => {
  it.each([
    { nonRandom: 1, completeAllMatchUps: false },
    { nonRandom: 2, completeAllMatchUps: true },
  ])(
    'nonRandom $nonRandom, complete $completeAllMatchUps',
    (profile) => {
      const tournamentRecord = generate(profile);
      const filters = getFilters(tournamentRecord);

      let compared = 0;
      let preFiltered = 0;
      let nonEmpty = 0;
      for (const participantFilters of filters) {
        for (const options of OPTIONS) {
          const params = { ...options, participantFilters, returnParticipantMap: false };

          preFilterCalls.mockClear();
          preFiltering = true;
          const result = tournamentEngine.getParticipants(params);
          if (preFilterCalls.mock.results.some(({ value }) => value)) preFiltered += 1;

          preFiltering = false;
          const whole = tournamentEngine.getParticipants(params);

          expect(result, JSON.stringify({ participantFilters, options })).toStrictEqual(whole);
          if (whole.participants?.length) nonEmpty += 1;
          compared += 1;
        }
      }

      expect(compared).toEqual(filters.length * OPTIONS.length);
      // pre-filtering ran for every call but those with withDraws, which returns matchUps whose sides read the map
      // and those filtering by accessorValues
      const withDraws = OPTIONS.filter((options) => options.withDraws).length;
      const byAccessor = filters.filter((filter) => filter.accessorValues).length;
      const neither = (filters.length - byAccessor) * (OPTIONS.length - withDraws);
      expect(preFiltered).toEqual(neither);
      expect(nonEmpty).toBeGreaterThan(compared - 2 * OPTIONS.length);
      expect(tournamentEngine.getParticipants({ returnParticipantMap: false }).missingParticipantIds).toEqual([
        'no-such-participant',
      ]);
    },
    300_000,
  );
});

describe('canPreFilter', () => {
  it('builds the whole pool when the map is returned, nothing is filtered, or a filter or option reads others', () => {
    const participantFilters: ParticipantFilters = { participantRoles: [OFFICIAL] };
    preFiltering = true;
    expect(canPreFilter({ participantFilters, returnParticipantMap: false })).toEqual(true);
    expect(canPreFilter({ participantFilters })).toEqual(false);
    expect(canPreFilter({ participantFilters, returnParticipantMap: true })).toEqual(false);
    expect(canPreFilter({ participantFilters: {}, returnParticipantMap: false })).toEqual(false);
    expect(canPreFilter({ returnParticipantMap: false })).toEqual(false);
    expect(
      canPreFilter({
        participantFilters: { accessorValues: [{ accessor: 'person.sex', value: MALE }] },
        returnParticipantMap: false,
      }),
    ).toEqual(false);
    for (const option of ['withOpponents', 'withMatchUps', 'withStatistics', 'scheduleAnalysis', 'withDraws']) {
      expect(canPreFilter({ participantFilters, returnParticipantMap: false, [option]: true } as any)).toEqual(false);
    }
  });

  it('reports missing ids as getParticipantMap does, in its order', () => {
    const participants: any[] = [
      { participantId: 'A' },
      { participantId: 'P', individualParticipantIds: ['A', 'X', 'Y'] },
      { participantType: PAIR },
      { participantId: 'T', individualParticipantIds: ['Z'] },
    ];
    expect(getMissingParticipantIds(participants)).toEqual(['X', 'Y', undefined, 'Z']);
  });
});
