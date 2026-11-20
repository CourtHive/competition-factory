import { createHydrationCache, getCachedParticipantLookup } from '@Query/matchUps/hydrationCache';
import { buildParticipantLookup, pairMembersKey } from '@Query/participants/participantLookup';
import { findPairedParticipant } from '@Query/participant/getPairedParticipant';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { findParticipant } from '@Acquire/findParticipant';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it, vi } from 'vitest';

// constants and types
import { INDIVIDUAL, PAIR, TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';

/**
 * TEAM hydration finds a side's participant, a pair's individuals, a line's team and a doubles line's pair in a
 * lookup built once per read (participantLookup.ts) where it scanned the whole participant list each time. The
 * change must not be visible: every read below is made twice, once with the lookup switched off (so every find
 * scans, as before the change) and once with it on, and the two results must be strictly equal.
 *
 * Nothing here records an outcome, so the file reads the same under every OUTCOME_PIPELINE.
 */
const lookup = vi.hoisted(() => ({ enabled: true, builds: 0 }));
vi.mock('@Query/participants/participantLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@Query/participants/participantLookup')>();
  return {
    ...actual,
    buildParticipantLookup: (participants: unknown) => {
      if (!lookup.enabled) return undefined;
      lookup.builds += 1;
      return actual.buildParticipantLookup(participants);
    },
  };
});

const DRAW_ID = 'teamDraw';

// six teams in a draw of eight, so two duals hold a BYE (a drawPosition with no participant)
function generate(drawSize = 8, participantsCount = 6) {
  let result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, eventType: TEAM, participantsCount, drawId: DRAW_ID, drawSize }],
    nonRandom: 1,
    setState: true,
  } as any);
  expect(result.success).toEqual(true);
  result = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, drawId: DRAW_ID, attach: true });
  expect(result.success).toEqual(true);
}

const currentRecord = () => tournamentEngine.getTournament().tournamentRecord;

/** every read that reaches the participant list, over one record */
function reads(tournamentRecord: any, tournamentParticipants?: any[]) {
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions.find((draw: any) => draw.drawId === DRAW_ID);
  const base = { tournamentRecord, drawDefinition, event, inContext: true };
  return {
    // no participantMap: every participant is found in the list
    drawMatchUps: getDrawMatchUps({ ...base, tournamentParticipants }),
    withScaleValues: getDrawMatchUps({ ...base, tournamentParticipants, contextProfile: { withScaleValues: true } }),
    // with a participantMap: the list is the fallback
    allDrawMatchUps: allDrawMatchUps({ ...base, participants: tournamentParticipants }),
    // the outcome pipeline's index: teams and pairs only
    structuralIndex: buildStructuralIndex({ tournamentRecord, drawDefinition, event, team: true }),
  };
}

/** the reads with every find scanning, then with the lookup, required equal; answers the lookup's */
function readBothWays(tournamentRecord: any, tournamentParticipants?: any[]) {
  lookup.enabled = false;
  lookup.builds = 0;
  const scanned = reads(tournamentRecord, tournamentParticipants);
  expect(lookup.builds).toEqual(0);

  lookup.enabled = true;
  const lookedUp = reads(tournamentRecord, tournamentParticipants);
  // the lookup was built, so the second read is not the first one again
  expect(lookup.builds).toBeGreaterThan(0);

  expect(lookedUp).toStrictEqual(scanned);
  return lookedUp;
}

const linesOf = (read: any) => {
  const { upcomingMatchUps = [], pendingMatchUps = [], completedMatchUps = [], byeMatchUps = [] } = read;
  return [...upcomingMatchUps, ...pendingMatchUps, ...completedMatchUps, ...byeMatchUps].filter(
    (matchUp: any) => matchUp.collectionId,
  );
};
const sidesOf = (lines: any[]) => lines.flatMap((line: any) => line.sides ?? []);

describe('TEAM hydration by participant lookup', () => {
  it('hydrates a draw with BYEs exactly as the scans did', () => {
    generate();
    const tournamentRecord = currentRecord();
    const read = readBothWays(tournamentRecord);

    // the fixture is not degenerate: lines of both types, with participants, teams and individuals on their sides
    const lines = linesOf(read.drawMatchUps);
    const doublesSides = sidesOf(lines.filter((line: any) => line.matchUpType === DOUBLES));
    const singlesSides = sidesOf(lines.filter((line: any) => line.matchUpType === SINGLES));
    expect(singlesSides.filter((side: any) => side.participant?.participantType === INDIVIDUAL).length).toBeGreaterThan(
      0,
    );
    const pairSides = doublesSides.filter((side: any) => side.participant?.participantType === PAIR);
    expect(pairSides.length).toBeGreaterThan(0);
    expect(pairSides.every((side: any) => side.participant.individualParticipants?.length === 2)).toEqual(true);
    expect(sidesOf(lines).filter((side: any) => side.teamParticipant?.participantId).length).toBeGreaterThan(0);
    expect(linesOf(read.drawMatchUps).length).toEqual(read.structuralIndex.matchUps.filter(isLine).length);

    // and with the list handed in, as a caller holding one does
    readBothWays(tournamentRecord, tournamentRecord.participants);
  });

  it('answers the FIRST of duplicated participants, as a scan does', () => {
    generate();
    const tournamentRecord = currentRecord();
    const before = readBothWays(tournamentRecord);
    const pairSide = sidesOf(linesOf(before.drawMatchUps)).find(
      (side: any) => side.participant?.participantType === PAIR,
    );
    const pairId = pairSide.participantId;
    const teamId = pairSide.teamParticipant.participantId;
    const individualId = pairSide.participant.individualParticipantIds[0];

    const stored = (participantId: string) =>
      tournamentRecord.participants.find((participant: any) => participant.participantId === participantId);
    const copyOf = (participantId: string, changes: object) => ({
      ...structuredClone(stored(participantId)),
      ...changes,
    });

    tournamentRecord.participants = [
      // the same pair of individuals under another id, ahead of the pair the lineUps were built with
      copyOf(pairId, { participantId: 'pair-first', participantName: 'FIRST PAIR' }),
      // the same ids twice: the first in the list answers
      copyOf(teamId, { participantName: 'FIRST TEAM' }),
      copyOf(individualId, { participantName: 'FIRST INDIVIDUAL' }),
      ...tournamentRecord.participants,
      // and after the originals, which must then never answer
      copyOf(pairId, { participantId: 'pair-last', participantName: 'LAST PAIR' }),
      copyOf(teamId, { participantName: 'LAST TEAM' }),
      copyOf(individualId, { participantName: 'LAST INDIVIDUAL' }),
    ];

    const read = readBothWays(tournamentRecord);
    const sides = sidesOf(linesOf(read.drawMatchUps));
    const firstPairSides = sides.filter((side: any) => side.participantId === 'pair-first');
    expect(firstPairSides.length).toBeGreaterThan(0);
    expect(firstPairSides.every((side: any) => side.participant.participantName === 'FIRST PAIR')).toEqual(true);
    expect(sides.some((side: any) => [pairId, 'pair-last'].includes(side.participantId))).toEqual(false);
    const individuals = firstPairSides.flatMap((side: any) => side.participant.individualParticipants);
    expect(individuals.some((individual: any) => individual.participantName === 'FIRST INDIVIDUAL')).toEqual(true);
    expect(JSON.stringify(read)).not.toContain('LAST ');

    // the structural index reads the pair's id the same way
    const indexSides = sidesOf(read.structuralIndex.matchUps.filter(isLine));
    expect(indexSides.some((side: any) => side.participantId === 'pair-first')).toEqual(true);
    expect(indexSides.some((side: any) => side.participantId === pairId)).toEqual(false);

    readBothWays(tournamentRecord, tournamentRecord.participants);
  });

  it('finds the TEAM behind another participant holding its id, and the participant with no id for a BYE', () => {
    generate();
    const tournamentRecord = currentRecord();
    const teamId = tournamentRecord.participants.find(
      (participant: any) => participant.participantType === TEAM_PARTICIPANT,
    ).participantId;
    tournamentRecord.participants = [
      // not a TEAM, and first with the team's id: the index's team is the TEAM further down
      { participantType: INDIVIDUAL, participantName: 'NOT A TEAM', participantId: teamId },
      // no id at all: what a scan for an unassigned position's (undefined) participantId finds
      { participantType: INDIVIDUAL, participantName: 'NO ID' },
      ...tournamentRecord.participants,
    ];

    const read = readBothWays(tournamentRecord);
    const dual: any = read.structuralIndex.matchUps.find(
      (matchUp: any) => matchUp.tieMatchUps && matchUp.sides?.some((side: any) => side.participantId === teamId),
    );
    const teamSide = dual.tieMatchUps[0].sides.find((side: any) => side.teamParticipant?.participantId === teamId);
    expect(teamSide.teamParticipant.participantName).not.toEqual('NOT A TEAM');
    expect(JSON.stringify(read.structuralIndex)).toContain('NO ID');

    readBothWays(tournamentRecord, tournamentRecord.participants);
  });

  it('hydrates the same when participants the lineUps name are missing', () => {
    generate();
    const tournamentRecord = currentRecord();
    const before = readBothWays(tournamentRecord);
    const pairSides = sidesOf(linesOf(before.drawMatchUps)).filter(
      (side: any) => side.participant?.participantType === PAIR,
    );
    const [first, second] = pairSides;
    const missing = new Set([
      first.participantId,
      second.participant.individualParticipantIds[0],
      first.teamParticipant.participantId,
    ]);
    tournamentRecord.participants = tournamentRecord.participants.filter(
      (participant: any) => !missing.has(participant.participantId),
    );

    const read = readBothWays(tournamentRecord);
    const sides = sidesOf(linesOf(read.drawMatchUps));
    expect(sides.some((side: any) => side.participantId === first.participantId)).toEqual(false);
    expect(sides.some((side: any) => side.participant?.participantId === first.participantId)).toEqual(false);

    readBothWays(tournamentRecord, tournamentRecord.participants);
  });

  it('reads the participants as they are after each mutation: a lookup does not outlive its read', () => {
    generate();
    const before = readBothWays(currentRecord());
    const line = linesOf(before.drawMatchUps).find(
      (matchUp: any) =>
        matchUp.matchUpType === DOUBLES &&
        matchUp.sides?.every((side: any) => side.participant?.participantType === PAIR),
    );
    const { matchUpId, matchUpTieId } = line;
    const side = line.sides[0];
    const [staying, leaving] = side.participant.individualParticipantIds;
    const sideOf = (read: any) =>
      linesOf(read.drawMatchUps)
        .find((matchUp: any) => matchUp.matchUpId === matchUpId)
        .sides.find(({ sideNumber }: any) => sideNumber === side.sideNumber);

    // a team member who is not in this line's pair takes the place of one who is: a PAIR participant is ADDED
    const team = currentRecord().participants.find(
      (participant: any) => participant.participantId === side.teamParticipant.participantId,
    );
    const arriving = team.individualParticipantIds.find((id: string) => ![staying, leaving].includes(id));
    const participantsCount = currentRecord().participants.length;
    let result: any = tournamentEngine.replaceTieMatchUpParticipantId({
      existingParticipantId: leaving,
      newParticipantId: arriving,
      tieMatchUpId: matchUpId,
      drawId: DRAW_ID,
    });
    expect(result.success).toEqual(true);

    const afterAdd = sideOf(readBothWays(currentRecord()));
    expect(afterAdd.participantId).not.toEqual(side.participantId);
    expect(afterAdd.participant.individualParticipantIds.toSorted()).toEqual([staying, arriving].toSorted());
    const addedPair = currentRecord().participants.find(
      (participant: any) => participant.participantId === afterAdd.participantId,
    );
    expect(addedPair.participantType).toEqual(PAIR);
    expect(currentRecord().participants.length).toBeGreaterThanOrEqual(participantsCount);

    // a participant is MODIFIED: the next read carries the change
    result = tournamentEngine.modifyParticipant({
      participant: { participantId: team.participantId, participantName: 'RENAMED TEAM' },
    });
    expect(result.success).toEqual(true);
    const afterModify = readBothWays(currentRecord());
    expect(sideOf(afterModify).teamParticipant.participantName).toEqual('RENAMED TEAM');
    const dual: any = afterModify.structuralIndex.matchUps.find((matchUp: any) => matchUp.matchUpId === matchUpTieId);
    expect(JSON.stringify(dual.tieMatchUps)).toContain('RENAMED TEAM');
  });

  it('reads a list edited IN PLACE between two reads, each read building its own lookup', () => {
    generate();
    const tournamentRecord = currentRecord();
    const participants = tournamentRecord.participants;
    const before = readBothWays(tournamentRecord, participants);
    const side = sidesOf(linesOf(before.drawMatchUps)).find((s: any) => s.participant?.participantType === PAIR);
    const pair = participants.find((participant: any) => participant.participantId === side.participantId);

    // same list, same length: the pair no longer holds these two individuals, so no pair is found for the line
    const members = pair.individualParticipantIds;
    pair.individualParticipantIds = [members[0], 'somebody-else'];
    const edited = readBothWays(tournamentRecord, participants);
    expect(sidesOf(linesOf(edited.drawMatchUps)).some((s: any) => s.participantId === pair.participantId)).toEqual(
      false,
    );

    // and a participant re-keyed in place is found under its new id only
    pair.individualParticipantIds = members;
    pair.participantId = 'pair-rekeyed';
    const rekeyed = readBothWays(tournamentRecord, participants);
    const rekeyedSides = sidesOf(linesOf(rekeyed.drawMatchUps)).filter((s: any) => s.participantId === 'pair-rekeyed');
    expect(rekeyedSides.length).toBeGreaterThan(0);
    expect(rekeyedSides.every((s: any) => s.participant?.participantId === 'pair-rekeyed')).toEqual(true);
  });
});

const isLine = (matchUp: any) => !!matchUp.collectionId;

describe('the participant lookup', () => {
  const individual = (participantId: string, extra: object = {}) => ({
    participantType: INDIVIDUAL,
    participantId,
    ...extra,
  });
  const pair = (participantId: string, individualParticipantIds: any) => ({
    participantType: PAIR,
    individualParticipantIds,
    participantId,
  });

  it('keys one or two distinct string ids, in either order, and nothing else', () => {
    expect(pairMembersKey(['a', 'b'])).toEqual(pairMembersKey(['b', 'a']));
    expect(pairMembersKey(['a'])).toBeDefined();
    expect(pairMembersKey(['a'])).not.toEqual(pairMembersKey(['a', 'b']));
    // an id holding the separator of a naive join cannot collide
    expect(pairMembersKey(['a,b'])).not.toEqual(pairMembersKey(['a', 'b']));
    expect(pairMembersKey(['a","b'])).not.toEqual(pairMembersKey(['a', 'b']));
    for (const unkeyed of [undefined, 'ab', [], ['a', 'a'], ['a', 'b', 'c'], [1], ['a', 2], [undefined, 'a']])
      expect(pairMembersKey(unkeyed)).toBeUndefined();
  });

  it('declines a list a lookup cannot answer for as a scan would', () => {
    lookup.enabled = true;
    expect(buildParticipantLookup(undefined)).toBeUndefined();
    expect(buildParticipantLookup([individual('a'), null])).toBeUndefined();
    expect(buildParticipantLookup([individual('a'), 'b'])).toBeUndefined();
    expect(buildParticipantLookup([individual('a'), { participantId: 7 }])).toBeUndefined();
    expect(buildParticipantLookup([individual('a'), { participantId: null }])).toBeUndefined();
    expect(buildParticipantLookup([])).toBeDefined();
  });

  it('finds a participant and a pair as the scans do, over lists with duplicates and oddities', () => {
    lookup.enabled = true;
    const lists: any[][] = [
      [],
      [individual('a'), individual('b'), pair('p1', ['a', 'b']), pair('p2', ['b', 'a']), pair('p3', ['a', 'b'])],
      [individual('a', { n: 1 }), individual('a', { n: 2 }), { participantType: INDIVIDUAL, n: 3 }],
      [pair('solo', ['a']), pair('twice', ['a', 'a']), pair('none', undefined), pair('three', ['a', 'b', 'c'])],
      [pair('mixed', ['a', 2]), pair('numbers', [1, 2]), pair('p', ['a', 'b']), { participantType: TEAM_PARTICIPANT }],
      [individual('a', { person: { personId: 'person-a' } }), individual('b', { person: { personId: 'person-b' } })],
    ];
    const idQueries: any[] = ['a', 'b', 'p1', 'missing', '', undefined, 7];
    const pairQueries: any[] = [['a', 'b'], ['b', 'a'], ['a'], ['a', 'a'], ['a', 2], [1, 2], [2, 1], ['x', 'y'], [7]];

    let found = 0;
    let paired = 0;
    for (const tournamentParticipants of lists) {
      const participantLookup = buildParticipantLookup(tournamentParticipants);
      expect(participantLookup).toBeDefined();
      for (const participantId of idQueries) {
        const scanned = findParticipant({ tournamentParticipants, participantId, internalUse: true });
        const lookedUp = findParticipant({
          tournamentParticipants,
          participantLookup,
          internalUse: true,
          participantId,
        });
        expect(lookedUp).toStrictEqual(scanned);
        if (scanned) found += 1;
      }
      // a personId is never answered from the lookup
      for (const personId of ['person-a', 'person-b', 'nobody']) {
        const args = { tournamentParticipants, participantId: 'b', internalUse: true, personId };
        expect(findParticipant({ ...args, participantLookup })).toStrictEqual(findParticipant(args));
      }
      for (const participantIds of pairQueries) {
        const scanned = findPairedParticipant({ tournamentParticipants, participantIds });
        const lookedUp = findPairedParticipant({ tournamentParticipants, participantLookup, participantIds });
        expect(lookedUp).toStrictEqual(scanned);
        if (scanned.participant) paired += 1;
      }
    }
    // both kinds of find did find something, and duplicates were reported in list order
    expect(found).toBeGreaterThan(0);
    expect(paired).toBeGreaterThan(0);
    const duplicated = findPairedParticipant({
      participantLookup: buildParticipantLookup(lists[1]),
      tournamentParticipants: lists[1],
      participantIds: ['b', 'a'],
    });
    expect(duplicated.participant?.participantId).toEqual('p1');
    expect(duplicated.duplicatedPairParticipants?.map((participant) => participant.participantId)).toEqual([
      'p2',
      'p3',
    ]);
  });

  it('is built once per list per cache, and again when the list has grown', () => {
    lookup.enabled = true;
    const tournamentParticipants: any[] = [individual('a'), individual('b')];
    const hydrationCache = createHydrationCache();

    expect(getCachedParticipantLookup({ tournamentParticipants })).toBeUndefined();
    expect(getCachedParticipantLookup({ hydrationCache })).toBeUndefined();

    lookup.builds = 0;
    const first = getCachedParticipantLookup({ hydrationCache, tournamentParticipants });
    expect(first?.firstById.get('a')).toBe(tournamentParticipants[0]);
    expect(getCachedParticipantLookup({ hydrationCache, tournamentParticipants })).toBe(first);
    expect(lookup.builds).toEqual(1);

    // another list, even an equal one, has its own lookup; so does another cache
    const equalList = [...tournamentParticipants];
    expect(getCachedParticipantLookup({ hydrationCache, tournamentParticipants: equalList })).not.toBe(first);
    const otherCache = { venueData: createHydrationCache().venueData };
    expect(getCachedParticipantLookup({ hydrationCache: otherCache, tournamentParticipants })).not.toBe(first);
    expect(lookup.builds).toEqual(3);

    // a cache held past its read (which hydrationCache.ts forbids) still notices a participant added to the list
    tournamentParticipants.push(individual('c'));
    const grown = getCachedParticipantLookup({ hydrationCache, tournamentParticipants });
    expect(grown).not.toBe(first);
    expect(grown?.firstById.get('c')).toBe(tournamentParticipants[2]);

    // a list it cannot answer for is remembered as such, not rebuilt for every find
    const odd: any[] = [individual('a'), null];
    lookup.builds = 0;
    expect(getCachedParticipantLookup({ hydrationCache, tournamentParticipants: odd })).toBeUndefined();
    expect(getCachedParticipantLookup({ hydrationCache, tournamentParticipants: odd })).toBeUndefined();
    expect(lookup.builds).toEqual(1);
  });
});
