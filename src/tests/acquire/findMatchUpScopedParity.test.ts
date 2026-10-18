import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { findMatchUp, publicFindMatchUp } from '@Acquire/findMatchUp';
import { POLICY_PRIVACY_DEFAULT } from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { COMPETITOR, OFFICIAL } from '@Constants/participantRoles';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
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

// findMatchUp hydrates only the participants its draw references. Every lookup must return what hydrating the whole
// participant pool returned, so each matchUp is found twice, with the scope in force and with it replaced by the
// whole pool (what findMatchUp did before), and the two results are compared.
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
  { drawSize: 32, drawType: SINGLE_ELIMINATION },
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

  return tournamentEngine.getTournament().tournamentRecord;
}

const LOOKUPS: Array<{ name: string; find: (tournamentRecord, matchUpId) => any }> = [
  {
    name: 'publicFindMatchUp',
    find: (tournamentRecord, matchUpId) => publicFindMatchUp({ tournamentRecord, matchUpId }),
  },
  {
    name: 'nextMatchUps',
    find: (tournamentRecord, matchUpId) => publicFindMatchUp({ tournamentRecord, matchUpId, nextMatchUps: true }),
  },
  {
    name: 'participantsProfile',
    find: (tournamentRecord, matchUpId) =>
      publicFindMatchUp({
        participantsProfile: { withIOC: true, withISO2: true, withScaleValues: true, withGroupings: true },
        tournamentRecord,
        matchUpId,
      }),
  },
  {
    name: 'contextProfile',
    find: (tournamentRecord, matchUpId) =>
      publicFindMatchUp({
        contextProfile: { withScaleValues: true, withCompetitiveness: true },
        tournamentRecord,
        matchUpId,
      }),
  },
  {
    name: 'not inContext',
    find: (tournamentRecord, matchUpId) => {
      const { matchUp, structure, error } = findMatchUp({ tournamentRecord, matchUpId });
      return makeDeepCopy({ matchUp, structureId: structure?.structureId, error }, false, true);
    },
  },
];

describe('findMatchUp returns what hydrating every participant returned', () => {
  const cases = [
    { nonRandom: 1, completeAllMatchUps: false, privacy: false },
    { nonRandom: 2, completeAllMatchUps: true, privacy: false },
    { nonRandom: 3, completeAllMatchUps: true, privacy: true },
  ];

  it.each(cases)(
    'nonRandom $nonRandom, complete $completeAllMatchUps, privacy $privacy',
    (profile) => {
      const tournamentRecord = generate(profile);
      const matchUpIds = tournamentEngine.allTournamentMatchUps({ inContext: false }).matchUps.map((m) => m.matchUpId);
      expect(matchUpIds.length).toBeGreaterThan(300);

      let compared = 0;
      let narrowed = 0;
      for (const lookup of LOOKUPS) {
        for (const matchUpId of matchUpIds) {
          scopeCalls.mockClear();
          scoping = true;
          const scoped = lookup.find(tournamentRecord, matchUpId);
          const scope = scopeCalls.mock.results[0]?.value;
          if (scope && scope.length < tournamentRecord.participants.length) narrowed += 1;

          scoping = false;
          const whole = lookup.find(tournamentRecord, matchUpId);

          expect(scoped, `${lookup.name} ${matchUpId}`).toStrictEqual(whole);
          compared += 1;
        }
      }

      expect(compared).toEqual(LOOKUPS.length * matchUpIds.length);
      // the scope is in force. The mocks share one pool of individuals across events, so the first singles draw
      // reaches every pair and team through its individuals' groupings and keeps the whole pool; the other draws
      // copy fewer participants
      expect(narrowed).toBeGreaterThan(compared / 2);
    },
    180_000,
  );
});

describe('getReferencedParticipants', () => {
  it("keeps the draw's participants, their individuals and every group they belong to, in stored order", () => {
    const tournamentRecord = generate({ nonRandom: 4, completeAllMatchUps: false, privacy: false });
    const { participants } = tournamentRecord;
    const doubles = tournamentRecord.events.find(({ eventType }) => eventType === DOUBLES);
    const drawDefinition = doubles.drawDefinitions[0];

    const scoped = getReferencedParticipants({ participants, record: drawDefinition });
    const scopedIds = scoped.map(({ participantId }) => participantId);

    const pairIds = drawDefinition.entries.map(({ participantId }) => participantId);
    const byId = new Map<string, any>(participants.map((p) => [p.participantId, p]));
    const individualIds = pairIds.flatMap((pairId) => byId.get(pairId).individualParticipantIds);
    for (const id of [...pairIds, ...individualIds]) expect(scopedIds).toContain(id);

    expect(scopedIds).toEqual(
      participants.map(({ participantId }) => participantId).filter((id) => scopedIds.includes(id)),
    );
    expect(scoped.length).toBeLessThan(participants.length);
    expect(scoped.some(({ participantRole }) => participantRole === OFFICIAL)).toEqual(false);
  });

  it('walks a record whose objects refer to each other once', () => {
    const participants: any[] = [{ participantId: 'P1' }, { participantId: 'P2' }, { participantId: 'P3' }];
    const drawDefinition: any = { drawId: 'D', entries: [{ participantId: 'P1' }], extensions: [{ value: { P2: 1 } }] };
    drawDefinition.self = drawDefinition;
    drawDefinition.entries.push(drawDefinition.entries);

    const scoped = getReferencedParticipants({ participants, record: drawDefinition });
    expect(scoped.map(({ participantId }) => participantId)).toEqual(['P1', 'P2']);
  });
});
