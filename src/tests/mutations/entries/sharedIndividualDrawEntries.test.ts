import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC, SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, MALE } from '@Constants/eventConstants';

/**
 * Draw entries for a bracketed draw are a committed field: any two entrants may be drawn against
 * each other, so two entries sharing an individual can produce a matchUp with one person on both
 * sides. AD_HOC entries are a roster instead -- one person partnering several others is the point --
 * and generation there pairs only legal opponents.
 */

function setup() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: INDIVIDUAL, sex: MALE, idPrefix: 'I' },
    setState: true,
  });
  const ids = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);

  tournamentEngine.addEvent({
    event: { eventName: 'Doubles', eventType: DOUBLES, gender: MALE, eventId: 'E1' },
  });

  const [A, B, C, D] = ids;
  // A appears in two pairs; C and D form a clean pair sharing nobody
  tournamentEngine.addEventEntryPairs({
    participantIdPairs: [
      [A, B],
      [A, C],
      [C, D],
    ],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
  });

  const pairs = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [PAIR] } }).participants;
  const byMembers = (x: string, y: string) =>
    pairs.find((p: any) => p.individualParticipantIds.includes(x) && p.individualParticipantIds.includes(y))
      .participantId;

  return { pairAB: byMembers(A, B), pairAC: byMembers(A, C), pairCD: byMembers(C, D) };
}

function makeDraw(drawType: string, drawSize = 4) {
  const gen = tournamentEngine.generateDrawDefinition({
    automated: false,
    eventId: 'E1',
    drawId: 'D1',
    drawType,
    drawSize,
  });
  if (gen.drawDefinition) {
    tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });
  }
  return gen;
}

it('refuses generating a DOUBLES elimination draw whose entrants share an individual', () => {
  setup();
  const gen = makeDraw(SINGLE_ELIMINATION);
  expect(gen.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  expect(gen.context?.conflictingPairs?.length).toBeGreaterThan(0);
});

it('refuses the same for other bracketed draw types', () => {
  for (const drawType of [FEED_IN_CHAMPIONSHIP, ROUND_ROBIN]) {
    setup();
    const gen = makeDraw(drawType);
    expect(gen.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  }
});

it('still generates an AD_HOC draw from the same overlapping entries', () => {
  setup();
  const gen = makeDraw(AD_HOC);
  expect(gen.error).toBeUndefined();
  expect(gen.drawDefinition.drawType).toEqual(AD_HOC);
});

it('refuses adding a PAIR to bracketed draw entries when an individual is already entered', () => {
  const { pairAB, pairAC, pairCD } = setup();

  // the draw is built from the two non-overlapping pairs only
  const gen = tournamentEngine.generateDrawDefinition({
    drawEntries: [pairAB, pairCD].map((participantId) => ({ participantId, entryStatus: DIRECT_ACCEPTANCE })),
    drawType: SINGLE_ELIMINATION,
    automated: false,
    eventId: 'E1',
    drawId: 'D1',
    drawSize: 4,
  });
  expect(gen.error).toBeUndefined();
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  // pairAC shares an individual with the already-entered pairAB
  const result = tournamentEngine.addDrawEntries({
    participantIds: [pairAC],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
    drawId: 'D1',
  });

  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  // pairAC conflicts with BOTH existing entries -- it shares A with pairAB and C with pairCD --
  // and every conflict is reported rather than only the first
  expect(result.context?.conflictingPairs?.length).toEqual(2);
  expect(result.context.conflictingPairs.every((pair: string[]) => pair.includes(pairAC))).toEqual(true);
});

it('refuses when both halves of the conflict arrive in the same addDrawEntries call', () => {
  const { pairAB, pairAC } = setup();
  const gen = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawEntries: [],
    automated: false,
    eventId: 'E1',
    drawId: 'D1',
    drawSize: 4,
  });
  expect(gen.error).toBeUndefined();
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  // neither is present yet -- the conflict exists only within the batch
  const result = tournamentEngine.addDrawEntries({
    participantIds: [pairAB, pairAC],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
    drawId: 'D1',
  });

  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
});

it('permits overlapping PAIRs in AD_HOC draw entries -- the flexible doubles case', () => {
  const { pairAB, pairAC, pairCD } = setup();
  const gen = tournamentEngine.generateDrawDefinition({
    drawEntries: [],
    automated: false,
    eventId: 'E1',
    drawId: 'D1',
    drawType: AD_HOC,
    drawSize: 4,
  });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  const result = tournamentEngine.addDrawEntries({
    participantIds: [pairAB, pairAC, pairCD],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
    drawId: 'D1',
  });

  expect(result.error).toBeUndefined();
  const entries = tournamentEngine.getEvent({ drawId: 'D1' }).drawDefinition.entries;
  expect(entries.map(({ participantId }) => participantId).sort((a, b) => (a < b ? -1 : 1))).toEqual(
    [pairAB, pairAC, pairCD].sort((a, b) => (a < b ? -1 : 1)),
  );
});

it('leaves SINGLES entries alone -- distinct individuals never share', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: INDIVIDUAL, idPrefix: 'S' },
    setState: true,
  });
  const ids = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);

  tournamentEngine.addEvent({ event: { eventName: 'Singles', eventId: 'E2' } });
  tournamentEngine.addEventEntries({ participantIds: ids, eventId: 'E2' });

  const gen = tournamentEngine.generateDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    automated: true,
    eventId: 'E2',
    drawId: 'D2',
    drawSize: 8,
  });

  expect(gen.error).toBeUndefined();
});
