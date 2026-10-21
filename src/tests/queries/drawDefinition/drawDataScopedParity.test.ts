import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { POLICY_PRIVACY_DEFAULT } from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { PayloadProfileEnum } from '@Types/tournamentTypes';
import { DOUBLES, TEAM } from '@Constants/eventConstants';
import {
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  LUCKY_DRAW,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

// getDrawData hydrates only the participants its draw references. Every drawData must be what hydrating the whole
// participant pool returned, so each read is made twice, with the scope in force and with it replaced by the whole
// pool (what getDrawData did before), and the two results are compared.
let scoping = true;
vi.mock('@Query/participants/getReferencedParticipants', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getReferencedParticipants: vi.fn((params) =>
      scoping ? actual.getReferencedParticipants(params) : params.participants,
    ),
  };
});
const scopeCalls = vi.mocked(getReferencedParticipants);

afterEach(() => {
  scoping = true;
});

const DRAW_PROFILES = [
  {
    drawSize: 32,
    drawType: SINGLE_ELIMINATION,
    qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
  },
  { drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION },
  { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
  { drawSize: 16, drawType: CURTIS_CONSOLATION },
  { drawSize: 16, drawType: COMPASS },
  { drawSize: 16, drawType: ROUND_ROBIN },
  { drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF },
  { drawSize: 8, drawType: LUCKY_DRAW },
  { drawSize: 8, drawType: AD_HOC, roundsCount: 2 },
  { drawSize: 8, eventType: DOUBLES },
  { drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO },
  { drawSize: 8, drawType: ROUND_ROBIN, eventType: TEAM, tieFormatName: DOMINANT_DUO },
];

/**
 * A tournament whose draws reach outside themselves the ways hydration can see: individuals grouped into a pair that
 * plays in no draw (their groupings name it), an official assigned to a matchUp, and participants in no draw at all.
 * Every event is published, so the public reads (`usePublishState`) see every structure.
 */
function generate({ nonRandom, completeAllMatchUps, privacy }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { scaledParticipantsCount: 40 },
    policyDefinitions: privacy ? POLICY_PRIVACY_DEFAULT : undefined,
    drawProfiles: DRAW_PROFILES,
    completeAllMatchUps,
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);

  const singles = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find(
      ({ drawId, sides }) =>
        drawId === tournamentRecord.events[0].drawDefinitions[0].drawId && sides?.[1]?.participantId,
    );
  const pairIds = singles.sides.map(({ participantId }) => participantId);
  let result: any = tournamentEngine.addParticipant({
    participant: { participantType: PAIR, participantRole: COMPETITOR, individualParticipantIds: pairIds },
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addParticipant({
    participant: {
      participantType: INDIVIDUAL,
      participantRole: OFFICIAL,
      person: { standardFamilyName: 'Official', standardGivenName: 'Assigned' },
    },
    returnParticipant: true,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addMatchUpOfficial({
    participantId: result.participant.participantId,
    drawId: singles.drawId,
    matchUpId: singles.matchUpId,
    officialType: 'REFEREE',
  });
  expect(result.success).toEqual(true);

  for (const { eventId } of tournamentRecord.events) {
    expect(tournamentEngine.publishEvent({ eventId }).success).toEqual(true);
  }

  return tournamentEngine.getTournament().tournamentRecord;
}

// what the public route sends (competition-factory-server functions/public/getDrawData.ts)
const PUBLIC_PARAMS = {
  participantsProfile: {
    convertExtensions: true,
    withScaleValues: true,
    withGroupings: true,
    withISO2: true,
    withIOC: true,
  },
  contextProfile: { withCompetitiveness: true },
  includePositionAssignments: true,
  allParticipantResults: true,
  usePublishState: true,
  pressureRating: true,
  refreshResults: true,
};

const READS: Array<{ name: string; read: (drawDefinition) => any[] }> = [
  { name: 'default', read: ({ drawId }) => [tournamentEngine.getDrawData({ drawId })] },
  { name: 'public', read: ({ drawId }) => [tournamentEngine.getDrawData({ drawId, ...PUBLIC_PARAMS })] },
  {
    name: 'public thin',
    read: ({ drawId }) => [tournamentEngine.getDrawData({ drawId, ...PUBLIC_PARAMS, hydrateParticipants: false })],
  },
  {
    name: 'contextProfile',
    read: ({ drawId }) => [
      tournamentEngine.getDrawData({ drawId, contextProfile: { withScaleValues: true, withCompetitiveness: true } }),
    ],
  },
  {
    name: 'privacy policy',
    read: ({ drawId }) => [
      tournamentEngine.getDrawData({
        participantsProfile: { withGroupings: true, withScaleValues: true },
        policyDefinitions: POLICY_PRIVACY_DEFAULT,
        drawId,
      }),
    ],
  },
  {
    name: 'stubs',
    read: ({ drawId }) => [tournamentEngine.getDrawData({ drawId, structuresProfile: PayloadProfileEnum.STUBS })],
  },
  {
    name: 'structureData',
    read: ({ drawId, structures }) =>
      structures.map(({ structureId }) => tournamentEngine.getStructureData({ drawId, structureId, ...PUBLIC_PARAMS })),
  },
];

describe('getDrawData returns what hydrating every participant returned', () => {
  const cases = [
    { nonRandom: 1, completeAllMatchUps: false, privacy: false },
    { nonRandom: 2, completeAllMatchUps: true, privacy: false },
    { nonRandom: 3, completeAllMatchUps: true, privacy: true },
  ];

  it.each(cases)(
    'nonRandom $nonRandom, complete $completeAllMatchUps, privacy $privacy',
    (profile) => {
      const tournamentRecord = generate(profile);
      const drawDefinitions = tournamentRecord.events.flatMap(({ drawDefinitions }) => drawDefinitions);
      expect(drawDefinitions.length).toEqual(DRAW_PROFILES.length);

      let compared = 0;
      let narrowed = 0;
      for (const read of READS) {
        for (const drawDefinition of drawDefinitions) {
          scopeCalls.mockClear();
          scoping = true;
          const scoped = read.read(drawDefinition);
          const scopes = scopeCalls.mock.results.map(({ value }) => value);
          if (scopes.some((scope) => scope.length < tournamentRecord.participants.length)) narrowed += 1;

          scoping = false;
          const whole = read.read(drawDefinition);

          for (const result of scoped) expect(result.error, `${read.name} ${drawDefinition.drawType}`).toBeUndefined();
          expect(scoped, `${read.name} ${drawDefinition.drawType}`).toStrictEqual(whole);
          compared += 1;
        }
      }

      expect(compared).toEqual(READS.length * drawDefinitions.length);
      // the scope is in force for every read that hydrates (STUBS builds no participants). The mocks share one pool
      // of individuals across events, so the first singles draw reaches every pair and team through its individuals'
      // groupings and keeps the whole pool; the other draws copy fewer participants
      expect(narrowed).toBeGreaterThan(compared / 2);
    },
    180_000,
  );
});
