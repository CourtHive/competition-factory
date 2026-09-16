import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import {
  buildIndividualIdsMap,
  getSharedIndividualIds,
  idsShareIndividual,
} from '@Query/participants/individualParticipantIds';

// constants
import { AD_HOC, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, MALE } from '@Constants/eventConstants';

/**
 * A person must never appear on both sides of a matchUp.
 *
 * `addEventEntryPairs` deliberately permits PAIRs that share an individual -- it rejects only an
 * exact duplicate pair -- which is what makes flexible AD_HOC doubles possible. These tests cover
 * the consequence: generation must never schedule two such PAIRs against each other.
 */

function setup({ drawType, automated }: { drawType: string; automated: boolean }) {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: INDIVIDUAL, sex: MALE, idPrefix: 'I' },
    setState: true,
  });
  const ids = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);

  tournamentEngine.addEvent({
    event: { eventName: 'AdHoc Doubles', eventType: DOUBLES, gender: MALE, eventId: 'E1' },
  });

  const [A, B, C, D] = ids;
  // every individual sits in exactly two PAIRs, so no two entrants can meet
  const entryResult = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [
      [A, B],
      [A, C],
      [B, D],
      [C, D],
    ],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
  });

  const pairs = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [PAIR] } }).participants;
  const membership: Record<string, string[]> = {};
  for (const p of pairs) membership[p.participantId] = p.individualParticipantIds;

  const gen = tournamentEngine.generateDrawDefinition({
    eventId: 'E1',
    drawId: 'D1',
    automated,
    drawType,
    drawSize: 4,
  });

  return { entryResult, gen, membership, individualIds: ids };
}

function conflictCount(matchUps: any[], membership: Record<string, string[]>) {
  let conflicts = 0;
  for (const matchUp of matchUps ?? []) {
    const sideIds = (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean);
    if (sideIds.length !== 2) continue;
    const [one, two] = sideIds.map((id: string) => membership[id] ?? []);
    if (one.filter((id: string) => two.includes(id)).length) conflicts++;
  }
  return conflicts;
}

it('permits PAIRs that share an individual -- the guard is on meeting, not on entry', () => {
  const { entryResult, membership } = setup({ drawType: AD_HOC, automated: false });
  expect(entryResult.error).toBeUndefined();
  expect(Object.keys(membership).length).toEqual(4);

  // each of the four individuals appears in exactly two PAIRs
  const counts: Record<string, number> = {};
  for (const pair of Object.values(membership)) for (const id of pair) counts[id] = (counts[id] ?? 0) + 1;
  expect(Object.values(counts)).toEqual([2, 2, 2, 2]);
});

it('refuses a ROUND_ROBIN drawType whose entrants share individuals', () => {
  const { gen } = setup({ drawType: ROUND_ROBIN, automated: true });
  expect(gen.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  // every offending pair is reported, not just the first
  expect(gen.context?.conflictingPairs?.length).toBeGreaterThan(1);
});

it('refuses a ROUND_ROBIN pairing shape over entrants that share individuals', () => {
  const { gen, membership } = setup({ drawType: AD_HOC, automated: false });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  const result = tournamentEngine.generateAdHocRounds({
    pairingProfile: { shape: ROUND_ROBIN },
    roundsCount: 3,
    drawId: 'D1',
  });

  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  expect(result.matchUps).toBeUndefined();
  expect(Object.keys(membership).length).toEqual(4);
});

it('drawMatic never pairs two PAIRs that share an individual', () => {
  const { gen, membership } = setup({ drawType: AD_HOC, automated: false });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });
  const structureId = gen.drawDefinition.structures[0].structureId;

  const result = tournamentEngine.generateDrawMaticRound({
    participantIds: Object.keys(membership),
    drawId: 'D1',
    structureId,
  });

  // the pool excludes every illegal pairing, so drawMatic has nothing legal to emit here
  const matchUps = result.matchUps ?? [];
  expect(conflictCount(matchUps, membership)).toEqual(0);
});

it('refuses an explicit adHoc pairing that shares an individual', () => {
  const { gen, membership } = setup({ drawType: AD_HOC, automated: false });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  // pick two PAIRs that share an individual -- that person would be on both sides
  const pairIds = Object.keys(membership);
  const [first] = pairIds;
  const second = pairIds.find(
    (id) => id !== first && membership[id].some((individual) => membership[first].includes(individual)),
  ) as string;

  const result = tournamentEngine.generateAdHocMatchUps({
    participantIdPairings: [{ participantIds: [first, second] }],
    drawId: 'D1',
  });

  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
});

it('refuses assigning a participant opposite a PAIR they belong to', () => {
  const { gen, membership } = setup({ drawType: AD_HOC, automated: false });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  const generated = tournamentEngine.generateAdHocRounds({ drawId: 'D1', matchUpsCount: 1 });
  const matchUpId = generated.matchUps[0].matchUpId;
  tournamentEngine.addAdHocMatchUps({ matchUps: generated.matchUps, drawId: 'D1' });

  const pairIds = Object.keys(membership);
  const [first] = pairIds;
  const overlapping = pairIds.find(
    (id) => id !== first && membership[id].some((individual) => membership[first].includes(individual)),
  ) as string;

  expect(
    tournamentEngine.assignMatchUpSideParticipant({
      participantId: first,
      drawId: 'D1',
      sideNumber: 1,
      matchUpId,
    }).success,
  ).toEqual(true);

  const result = tournamentEngine.assignMatchUpSideParticipant({
    participantId: overlapping,
    drawId: 'D1',
    sideNumber: 2,
    matchUpId,
  });

  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
});

it('the predicate resolves each participantType and is order-independent', () => {
  const individual = { participantId: 'i1', participantType: INDIVIDUAL } as any;
  const pairOne = { participantId: 'p1', participantType: PAIR, individualParticipantIds: ['i1', 'i2'] } as any;
  const pairTwo = { participantId: 'p2', participantType: PAIR, individualParticipantIds: ['i1', 'i3'] } as any;
  const pairThree = { participantId: 'p3', participantType: PAIR, individualParticipantIds: ['i4', 'i5'] } as any;

  expect(getSharedIndividualIds(pairOne, pairTwo)).toEqual(['i1']);
  expect(getSharedIndividualIds(pairTwo, pairOne)).toEqual(['i1']);
  expect(getSharedIndividualIds(pairOne, pairThree)).toEqual([]);
  // an INDIVIDUAL resolves to itself, so it conflicts with a PAIR containing it
  expect(getSharedIndividualIds(individual, pairOne)).toEqual(['i1']);
  // the same participant on both sides always conflicts
  expect(getSharedIndividualIds(pairThree, pairThree)).toEqual(['i4', 'i5']);

  const map = buildIndividualIdsMap([individual, pairOne, pairTwo, pairThree]);
  expect(idsShareIndividual(map, 'p1', 'p2')).toEqual(true);
  expect(idsShareIndividual(map, 'p1', 'p3')).toEqual(false);
  // an id absent from the map contributes no individuals and therefore no conflict
  expect(idsShareIndividual(map, 'p1', 'unknown')).toEqual(false);
});
