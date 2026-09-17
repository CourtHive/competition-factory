import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC, SWISS } from '@Constants/drawDefinitionConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, MALE } from '@Constants/eventConstants';

/**
 * A person can play in at most one matchUp per round.
 *
 * AD_HOC doubles may hold PAIRs that share an individual -- partners rotate, and one person can be
 * entered with several others. #4890 stops two such PAIRs meeting; these tests cover the other half:
 * two such PAIRs must not both be scheduled in the same round, or one person plays two matchUps at once.
 */

const DRAW_ID = 'D1';

/**
 * 16 individuals in 8 disjoint PAIRs (0/1, 2/3, ... 14/15), plus the rotating PAIR 0/2 entered into
 * the existing AD_HOC draw the way TMX pairs two already-paired individuals. At most 8 of the 9
 * entrants can play in any round, because 0/1, 2/3 and 0/2 cannot all be scheduled together.
 */
function rotatingPartnersSetup() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16, participantType: INDIVIDUAL, sex: MALE, idPrefix: 'I' },
    setState: true,
  });
  const ids = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);

  tournamentEngine.addEvent({ event: { eventName: 'Rotating', eventType: DOUBLES, gender: MALE, eventId: 'E1' } });

  const disjoint = ids.reduce((pairs: string[][], id: string, i: number) => {
    if (i % 2 === 0) pairs.push([id, ids[i + 1]]);
    return pairs;
  }, []);
  let result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: disjoint,
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
  });
  expect(result.success).toEqual(true);

  const gen = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: false,
    drawId: DRAW_ID,
    eventId: 'E1',
    drawSize: 8,
  });
  result = tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [[ids[0], ids[2]]],
    entryStatus: DIRECT_ACCEPTANCE,
    drawId: DRAW_ID,
    eventId: 'E1',
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  expect(drawDefinition.entries.length).toEqual(9);

  return { membership: getMembership(), structureId: drawDefinition.structures[0].structureId, ids };
}

function getMembership(): Record<string, string[]> {
  const pairs = tournamentEngine.getParticipants({ participantFilters: { participantTypes: [PAIR] } }).participants;
  return Object.fromEntries(pairs.map((p: any) => [p.participantId, p.individualParticipantIds]));
}

function pairIdOf(membership: Record<string, string[]>, a: string, b: string) {
  return Object.keys(membership).find((id) => membership[id].includes(a) && membership[id].includes(b)) as string;
}

// individuals appearing in more than one of the given matchUps
function doubleBooked(matchUps: any[], membership: Record<string, string[]>) {
  const counts: Record<string, number> = {};
  for (const matchUp of matchUps ?? []) {
    for (const side of matchUp.sides ?? []) {
      for (const individualId of membership[side.participantId] ?? []) {
        counts[individualId] = (counts[individualId] ?? 0) + 1;
      }
    }
  }
  return Object.keys(counts).filter((id) => counts[id] > 1);
}

it('drawMatic never schedules one individual in two matchUps of the same round', () => {
  const { membership, structureId } = rotatingPartnersSetup();

  for (let round = 1; round <= 8; round++) {
    const result = tournamentEngine.drawMatic({ drawId: DRAW_ID, dynamicRatings: false, generateMatchUps: true });
    expect(result.success).toEqual(true);
    expect(doubleBooked(result.matchUps, membership)).toEqual([]);
    // the round is as full as the entrants allow: 8 of 9 entrants can play, so 4 matchUps
    expect(result.matchUps.length).toEqual(4);

    const added = tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, drawId: DRAW_ID, structureId });
    expect(added.success).toEqual(true);
  }
});

it('drawMatic schedules only one matchUp when every entrant overlaps two others', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4, participantType: INDIVIDUAL, sex: MALE, idPrefix: 'I' },
    setState: true,
  });
  const [A, B, C, D] = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);
  tournamentEngine.addEvent({ event: { eventName: 'Square', eventType: DOUBLES, gender: MALE, eventId: 'E1' } });
  tournamentEngine.addEventEntryPairs({
    participantIdPairs: [
      [A, B],
      [A, C],
      [B, D],
      [C, D],
    ],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
  });
  const gen = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: false,
    drawId: DRAW_ID,
    eventId: 'E1',
    drawSize: 4,
  });
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });
  const membership = getMembership();

  for (let attempt = 0; attempt < 10; attempt++) {
    const result = tournamentEngine.generateDrawMaticRound({
      participantIds: Object.keys(membership),
      structureId: gen.drawDefinition.structures[0].structureId,
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);
    // AB v CD and AC v BD are both legal meetings, but each uses all four people
    expect(result.matchUps.length).toEqual(1);
    expect(doubleBooked(result.matchUps, membership)).toEqual([]);
  }
});

it('refuses a swiss round whose entrants share an individual', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: INDIVIDUAL, sex: MALE, idPrefix: 'I' },
    setState: true,
  });
  const ids = tournamentEngine
    .getParticipants({ participantFilters: { participantTypes: [INDIVIDUAL] } })
    .participants.map((p: any) => p.participantId);
  tournamentEngine.addEvent({ event: { eventName: 'Swiss', eventType: DOUBLES, gender: MALE, eventId: 'E1' } });
  tournamentEngine.addEventEntryPairs({
    participantIdPairs: [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
      [ids[4], ids[5]],
      [ids[6], ids[7]],
      [ids[0], ids[2]],
      [ids[1], ids[3]],
    ],
    entryStatus: DIRECT_ACCEPTANCE,
    eventId: 'E1',
  });
  const gen = tournamentEngine.generateDrawDefinition({
    drawType: SWISS,
    automated: false,
    drawId: DRAW_ID,
    eventId: 'E1',
  });
  expect(gen.success).toEqual(true);
  tournamentEngine.addDrawDefinition({ eventId: 'E1', drawDefinition: gen.drawDefinition });

  const result = tournamentEngine.generateSwissRound({ drawId: DRAW_ID });
  expect(result.error?.code).toEqual('ERR_SHARED_INDIVIDUAL_PARTICIPANT');
  expect(result.matchUps).toBeUndefined();
  // 0/1 overlaps 0/2 and 1/3; 2/3 overlaps 0/2 and 1/3 -- every offending pair is reported
  expect(result.context?.conflictingPairs?.length).toEqual(4);
});

it('manual assignment does not offer a participant sharing an individual with the opponent or the round', () => {
  const { membership, structureId, ids } = rotatingPartnersSetup();

  const generated = tournamentEngine.generateAdHocMatchUps({ drawId: DRAW_ID, matchUpsCount: 2, newRound: true });
  expect(generated.success).toEqual(true);
  tournamentEngine.addAdHocMatchUps({ matchUps: generated.matchUps, drawId: DRAW_ID, structureId });
  const [first, second] = generated.matchUps.map((m: any) => m.matchUpId);

  const pair01 = pairIdOf(membership, ids[0], ids[1]);
  const pair23 = pairIdOf(membership, ids[2], ids[3]);
  const pair02 = pairIdOf(membership, ids[0], ids[2]);

  const assigned = tournamentEngine.assignMatchUpSideParticipant({
    participantId: pair01,
    matchUpId: first,
    drawId: DRAW_ID,
    sideNumber: 1,
  });
  expect(assigned.success).toEqual(true);

  const available = (matchUpId: string, sideNumber: number, restrictAdHocRoundParticipants?: boolean) =>
    tournamentEngine
      .matchUpActions({ matchUpId, sideNumber, drawId: DRAW_ID, restrictAdHocRoundParticipants })
      .validActions.find((action: any) => action.type === ASSIGN_PARTICIPANT)?.availableParticipantIds ?? [];

  // opposite 0/1: 0/2 would put individual 0 on both sides; 2/3 shares nobody
  const opposing = available(first, 2);
  expect(opposing).not.toContain(pair02);
  expect(opposing).toContain(pair23);

  // elsewhere in the round: 0/2 would put individual 0 in two matchUps
  expect(available(second, 1)).not.toContain(pair02);
  expect(available(second, 1)).toContain(pair23);

  // the round restriction is a policy choice; the opponent restriction is not
  expect(available(second, 1, false)).toContain(pair02);
  expect(available(first, 2, false)).not.toContain(pair02);

  // replacing 0/1 on its own side frees individual 0, so 0/2 may take its place
  expect(available(first, 1)).toContain(pair02);
});
