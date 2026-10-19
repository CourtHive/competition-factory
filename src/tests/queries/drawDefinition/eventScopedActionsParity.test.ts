import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';
import { UNPAIRED } from '@Constants/entryStatusConstants';
import { PAIR } from '@Constants/participantConstants';
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

// matchUpActions and positionActions build only the participants their event references. Every action must be what
// building the whole pool returned, so each call is made twice, with the scope in force and with it replaced by the
// whole pool (what both did before), and the two results are compared.
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

const EVENT_PROFILES = [
  { drawProfiles: [{ drawSize: 32, participantsCount: 28, alternatesCount: 4, drawType: SINGLE_ELIMINATION }] },
  // two flights of one event: each flight's alternates include the other flight's entries
  {
    drawProfiles: [
      { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      { drawSize: 8, alternatesCount: 2 },
    ],
  },
  { drawProfiles: [{ drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP }] },
  { drawProfiles: [{ drawSize: 16, drawType: CURTIS_CONSOLATION }] },
  { drawProfiles: [{ drawSize: 16, drawType: COMPASS }] },
  { drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN }] },
  { drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF }] },
  { drawProfiles: [{ drawSize: 8, drawType: LUCKY_DRAW }] },
  { drawProfiles: [{ drawSize: 8, drawType: AD_HOC, roundsCount: 2 }] },
  { eventType: DOUBLES, drawProfiles: [{ drawSize: 8 }] },
  { eventType: TEAM, tieFormatName: DOMINANT_DUO, drawProfiles: [{ drawSize: 8 }] },
  { eventType: TEAM, tieFormatName: DOMINANT_DUO, drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }] },
];

/**
 * A tournament whose events reach outside themselves: singles players who also play doubles and team events (their
 * pairs and teams are in other events), unpaired individuals entered in the doubles event, and participants in no
 * event at all.
 */
function generate({ nonRandom, completeAllMatchUps }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 300 },
    // a qualifying structure feeding the main draw (accepted as a drawProfile, not inside an eventProfile)
    drawProfiles: [
      { drawSize: 16, qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 4, drawSize: 8 }] }] },
    ],
    eventProfiles: EVENT_PROFILES,
    completeAllMatchUps,
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);

  const doubles = tournamentRecord.events.find(({ eventType }) => eventType === DOUBLES);
  const paired = new Set(
    tournamentRecord.participants
      .filter(({ participantType }) => participantType === PAIR)
      .flatMap(({ individualParticipantIds }) => individualParticipantIds),
  );
  const singlesIds = tournamentRecord.events[0].entries
    .map(({ participantId }) => participantId)
    .filter((participantId) => !paired.has(participantId))
    .slice(0, 3);
  expect(singlesIds.length).toEqual(3);
  const result = tournamentEngine.addEventEntries({
    eventId: doubles.eventId,
    participantIds: singlesIds,
    entryStatus: UNPAIRED,
  });
  expect(result.success).toEqual(true);

  return tournamentEngine.getTournament().tournamentRecord;
}

function getCalls(tournamentRecord) {
  const calls: Array<{ name: string; params: any; method: string }> = [];
  const matchUps = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
  for (const { drawId, matchUpId } of matchUps) {
    for (const sideNumber of [undefined, 1, 2]) {
      calls.push({
        method: 'matchUpActions',
        name: `${matchUpId}:${sideNumber}`,
        params: { drawId, matchUpId, sideNumber },
      });
    }
  }
  for (const event of tournamentRecord.events) {
    for (const { drawId, structures } of event.drawDefinitions ?? []) {
      for (const structure of structures ?? []) {
        const { positionAssignments } = tournamentEngine.getPositionAssignments({
          drawId,
          structureId: structure.structureId,
        });
        for (const { drawPosition } of positionAssignments ?? []) {
          const params = { drawId, structureId: structure.structureId, drawPosition };
          calls.push({ method: 'positionActions', name: `${structure.structureId}:${drawPosition}`, params });
        }
      }
    }
  }
  return calls;
}

describe('the draw actions return what building every participant returned', () => {
  it.each([
    { nonRandom: 1, completeAllMatchUps: false },
    { nonRandom: 2, completeAllMatchUps: true },
  ])(
    'nonRandom $nonRandom, complete $completeAllMatchUps',
    (profile) => {
      const tournamentRecord = generate(profile);
      const calls = getCalls(tournamentRecord);
      expect(calls.filter(({ method }) => method === 'positionActions').length).toBeGreaterThan(200);
      expect(calls.filter(({ method }) => method === 'matchUpActions').length).toBeGreaterThan(600);

      let narrowed = 0;
      let offeringParticipants = 0;
      for (const { method, name, params } of calls) {
        scopeCalls.mockClear();
        scoping = true;
        const scoped = tournamentEngine[method](params);
        const scope = scopeCalls.mock.results.at(-1)?.value;
        if (scope && scope.length < tournamentRecord.participants.length) narrowed += 1;

        scoping = false;
        const whole = tournamentEngine[method](params);

        expect(scoped, `${method} ${name}`).toStrictEqual(whole);
        if (JSON.stringify(whole).includes('"participantName"')) offeringParticipants += 1;
      }

      // participants are offered (alternates, lucky losers, qualifiers, swaps, pairs), so the comparison covers them
      expect(offeringParticipants).toBeGreaterThan(100);
      // the scope is in force for every event: the pool is shared, but no event reaches all of it
      expect(narrowed).toEqual(calls.length);
    },
    600_000,
  );
});

describe('getReferencedParticipants', () => {
  it("keeps every member of a group it keeps, so a reader walking a group's members finds them", () => {
    const participants: any[] = [
      { participantId: 'I1' },
      { participantId: 'I2' },
      { participantId: 'I3' },
      { participantId: 'T1', individualParticipantIds: ['I1', 'I2'] },
      { participantId: 'P1', individualParticipantIds: ['I3', 'I4'] },
      { participantId: 'I4' },
      { participantId: 'I5' },
    ];
    // the event references I1 only: T1 is its team, and I2 is T1's other member
    const record: any = { eventId: 'E', entries: [{ participantId: 'I1' }] };
    const scoped = getReferencedParticipants({ participants, record }).map(({ participantId }) => participantId);
    expect(scoped).toEqual(['I1', 'I2', 'T1']);
  });
});
