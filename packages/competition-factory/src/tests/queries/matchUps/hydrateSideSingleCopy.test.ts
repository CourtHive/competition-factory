import { POLICY_PRIVACY_DEFAULT } from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { COMPASS, FEED_IN_CHAMPIONSHIP, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES, TEAM } from '@Constants/eventConstants';

// hydrateSideParticipant copies a side's participant once. It used to copy the result of findParticipant, which is
// already a fresh copy, a second time. Every read is made twice, with the single copy and with the second copy put
// back around findParticipant (what hydrateSideParticipant did before), and the two results are compared.
let secondCopy = false;
vi.mock('@Acquire/findParticipant', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    findParticipant: vi.fn((params) => {
      const participant = actual.findParticipant(params);
      return secondCopy ? makeDeepCopy(participant, undefined, true) : participant;
    }),
  };
});

afterEach(() => {
  secondCopy = false;
});

const DRAW_PROFILES = [
  { drawSize: 32, drawType: SINGLE_ELIMINATION },
  { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
  { drawSize: 16, drawType: COMPASS },
  { drawSize: 16, drawType: ROUND_ROBIN },
  { drawSize: 8, eventType: DOUBLES },
  { drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO },
];

function generate({ nonRandom, completeAllMatchUps, privacy }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { scaledParticipantsCount: 40 },
    policyDefinitions: privacy ? POLICY_PRIVACY_DEFAULT : undefined,
    drawProfiles: DRAW_PROFILES,
    completeAllMatchUps,
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);
  for (const { eventId } of tournamentRecord.events) {
    expect(tournamentEngine.publishEvent({ eventId }).success).toEqual(true);
  }
  return tournamentEngine.getTournament().tournamentRecord;
}

const PARTICIPANTS_PROFILE = {
  convertExtensions: true,
  withScaleValues: true,
  withGroupings: true,
  withISO2: true,
  withIOC: true,
};
const CONTEXT_PROFILE = { withScaleValues: true, withCompetitiveness: true };

const READS: Array<{ name: string; read: (tournamentRecord) => any[]; sharesIndividuals?: boolean }> = [
  { name: 'allTournamentMatchUps', read: () => [tournamentEngine.allTournamentMatchUps({ inContext: true })] },
  {
    name: 'allTournamentMatchUps profiles',
    read: () => [
      tournamentEngine.allTournamentMatchUps({
        participantsProfile: PARTICIPANTS_PROFILE,
        contextProfile: CONTEXT_PROFILE,
        inContext: true,
      }),
    ],
  },
  {
    name: 'allTournamentMatchUps privacy',
    read: () => [
      tournamentEngine.allTournamentMatchUps({
        policyDefinitions: POLICY_PRIVACY_DEFAULT,
        contextProfile: CONTEXT_PROFILE,
        inContext: true,
      }),
    ],
  },
  {
    name: 'allTournamentMatchUps thin',
    read: () => [tournamentEngine.allTournamentMatchUps({ inContext: true, hydrateParticipants: false })],
  },
  {
    name: 'getEventData',
    read: ({ events }) =>
      events.map(({ eventId }) =>
        tournamentEngine.getEventData({
          participantsProfile: PARTICIPANTS_PROFILE,
          contextProfile: CONTEXT_PROFILE,
          usePublishState: true,
          eventId,
        }),
      ),
  },
  {
    name: 'getDrawData',
    read: ({ events }) =>
      events
        .flatMap(({ drawDefinitions }) => drawDefinitions)
        .map(({ drawId }) =>
          tournamentEngine.getDrawData({
            participantsProfile: PARTICIPANTS_PROFILE,
            includePositionAssignments: true,
            contextProfile: CONTEXT_PROFILE,
            usePublishState: true,
            drawId,
          }),
        ),
  },
  {
    // the participantMap path: matchUps hydrated from the participants getParticipants has already built. Here a
    // side's individualParticipants are the map's own entries, uncopied, so every side a pair or team plays on
    // shares them (as on dev before this change). That sharing stays within the read's output, never reaching the
    // record, and copying it costs this read 37-61% more copy volume on DOUBLES and TEAM, so it is a separate call.
    name: 'getParticipants withMatchUps',
    sharesIndividuals: true,
    read: () => [
      tournamentEngine.getParticipants({
        participantsProfile: PARTICIPANTS_PROFILE,
        withMatchUps: true,
        withOpponents: true,
      }),
    ],
  },
];

// every hydrated side participant in a read's output, wherever the output nests its matchUps
function sideParticipants(value, found: any[] = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value.sides)) {
    for (const side of value.sides) if (side?.participant?.participantId) found.push(side.participant);
  }
  for (const child of Object.values(value)) sideParticipants(child, found, seen);
  return found;
}

function objectsWithin(value, skip?: string, objects = new Set<object>()) {
  if (!value || typeof value !== 'object' || objects.has(value)) return objects;
  objects.add(value);
  for (const [key, child] of Object.entries(value)) if (key !== skip) objectsWithin(child, skip, objects);
  return objects;
}

function mutate(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (value[key] && typeof value[key] === 'object') mutate(value[key], seen);
    else value[key] = 'MUTATED';
  }
  if (Array.isArray(value)) value.push('MUTATED');
  else value.MUTATED = true;
}

const cases = [
  { nonRandom: 1, completeAllMatchUps: false, privacy: false },
  { nonRandom: 2, completeAllMatchUps: true, privacy: false },
  { nonRandom: 3, completeAllMatchUps: true, privacy: true },
];

describe('hydrateSideParticipant copies a participant once', () => {
  it.each(cases)('returns what copying twice returned: nonRandom $nonRandom, privacy $privacy', (profile) => {
    const tournamentRecord = generate(profile);

    for (const read of READS) {
      secondCopy = false;
      const single = read.read(tournamentRecord);
      secondCopy = true;
      const double = read.read(tournamentRecord);

      for (const result of single) expect(result.error, read.name).toBeUndefined();
      if (read.name !== 'allTournamentMatchUps thin')
        expect(sideParticipants(single).length, read.name).toBeGreaterThan(0);
      expect(single, read.name).toStrictEqual(double);
    }
  });

  // Parity cannot see aliasing, and aliasing is the one thing a dropped copy can break: an emitted participant that
  // shares objects with the record, with a later read, or with another side would carry a caller's edit into them.
  it.each(cases)('emits participants nothing else holds: nonRandom $nonRandom, privacy $privacy', (profile) => {
    const tournamentRecord = generate(profile);
    const stored = makeDeepCopy(tournamentRecord, false, true);

    for (const read of READS) {
      const result = read.read(tournamentRecord);
      const before = makeDeepCopy(result, false, true);
      const participants = sideParticipants(result);

      const owner = new Map<object, number>();
      participants.forEach((participant, index) => {
        for (const object of objectsWithin(
          participant,
          read.sharesIndividuals ? 'individualParticipants' : undefined,
        )) {
          expect(owner.get(object) ?? index, `${read.name}: two sides share an object`).toEqual(index);
          owner.set(object, index);
        }
      });

      for (const participant of participants) mutate(participant);

      expect(tournamentEngine.getTournament().tournamentRecord, read.name).toStrictEqual(stored);
      expect(read.read(tournamentRecord), read.name).toStrictEqual(before);
    }
  });
});
