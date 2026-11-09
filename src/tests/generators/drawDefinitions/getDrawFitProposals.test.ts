import { getDrawFitProposals } from '@Generators/drawDefinitions/getDrawFitProposals';
import { feedInMatchUps } from '@Generators/drawDefinitions/feedInMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import type { GetDrawFitProposalsArgs } from '@Generators/drawDefinitions/getDrawFitProposals';
import { FEED_IN, MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import type { Event, Tournament } from '@Types/tournamentTypes';

function fixture(count: number, qualifying = 0) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    setState: true,
    participantsProfile: { participantsCount: Math.max(count + qualifying, 2) },
    eventProfiles: [{ eventName: 'Fit proposals' }],
  });
  const ids = tournamentEngine.getParticipants().participants.map((participant) => participant.participantId);
  if (count)
    expect(tournamentEngine.addEventEntries({ eventId, participantIds: ids.slice(0, count) }).success).toBe(true);
  if (qualifying)
    expect(
      tournamentEngine.addEventEntries({ eventId, participantIds: ids.slice(count), entryStage: QUALIFYING }).success,
    ).toBe(true);
  const { event } = tournamentEngine.getEvent({ eventId });
  const { tournamentRecord } = tournamentEngine.getTournament();
  return {
    eventId,
    event: event as Event,
    tournamentRecord: tournamentRecord as Tournament,
    rankedEntries: [...(event?.entries ?? [])].reverse(),
  };
}
const proposals = (result: any) => {
  expect(result.success).toBe(true);
  return result.proposals as any[];
};

it('offers ranked Cut and Grow for 40 into 32 and reports the generator extra BYEs honestly', () => {
  const args = fixture(40);
  let result: any = tournamentEngine.getDrawFitProposals({
    eventId: args.eventId,
    drawSize: 32,
    rankedEntries: args.rankedEntries,
  });
  const offered = proposals(result);
  const cut = offered.find((proposal) => proposal.kind === 'Cut');
  expect(cut.drawSize).toBe(32);
  expect(cut.entryChanges.map((change: any) => change.participantId)).toEqual(
    args.rankedEntries.slice(32).map((entry) => entry.participantId),
  );
  expect(cut.entryChanges.every((change: any) => change.entryStatus === ALTERNATE && change.entryStage === MAIN)).toBe(
    true,
  );
  expect(cut.consequence).toMatchObject({ cutToAlternate: 8, byesBeyondSeeds: 0 });
  expect(cut.fit.structures[0]).toMatchObject({ placed: 32, notPlaced: 0, status: 'FITS' });
  const grow = offered.find((proposal) => proposal.kind === 'Grow');
  expect(grow.drawSize).toBe(64);
  expect(grow.entryChanges).toEqual([]);
  expect(grow.consequence.byesBeyondSeeds).toBe(24);
  expect(grow.fit.structures[0]).toMatchObject({ placed: 40, byes: 24, status: 'SHORT' });
});

it('needs no growth when the seeds already absorb the six BYEs in 26 into 32', () => {
  const args = fixture(26);
  let result: any = getDrawFitProposals({ ...args, drawSize: 32, seedsCount: 8 });
  expect(proposals(result)).toEqual([]);
});

it('derives feed-in consequences from real feed-in positions without leaving entrants out', () => {
  const args = fixture(40);
  let result: any = getDrawFitProposals({ ...args, drawSize: 32 });
  const feed = proposals(result).find((proposal) => proposal.kind === 'Feed-in');
  expect(feed).toMatchObject({ drawType: FEED_IN, drawSize: 40, entryChanges: [], consequence: { fedIn: 8 } });
  expect(feed.fit.structures[0]).toMatchObject({ placed: 40, byes: 0, status: 'FITS' });
  const first = feedInMatchUps({ drawSize: 40 }).matchUps.filter((matchUp) => matchUp.roundNumber === 1);
  const direct = new Set(first.flatMap((matchUp) => matchUp.drawPositions ?? []));
  expect(feed.consequence.fedIn).toBe(feed.drawSize - direct.size);
});

it('steps round robin candidates by the actual configured group size and does not propose feed-in', () => {
  const args = fixture(10);
  let result: any = getDrawFitProposals({
    ...args,
    drawSize: 8,
    drawType: ROUND_ROBIN,
    structureOptions: { groupSize: 4 },
  });
  const offered = proposals(result);
  expect(offered.map((proposal) => [proposal.kind, proposal.drawSize])).toEqual([
    ['Cut', 8],
    ['Grow', 12],
  ]);
  expect(offered[0].fit.structures[0]).toMatchObject({ placed: 8, positions: 8 });
  expect(offered[1].fit.structures[0]).toMatchObject({ placed: 10, positions: 12, byes: 2 });
});

it('returns no proposals for an event with no entries', () => {
  let result: any = getDrawFitProposals({ ...fixture(0), drawSize: 32 });
  expect(proposals(result)).toEqual([]);
});

function limit(args: ReturnType<typeof fixture>, limits: Record<string, number>) {
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: { events: [{ match: { eventType: args.event.eventType! }, ...limits }] },
  } as Tournament['sanction'];
}

describe('sanction limits', () => {
  it('removes Grow and Feed-in above drawSize and cannot be bypassed with a caller flag', () => {
    const args = fixture(40);
    limit(args, { drawSize: 32 });
    let result: any = getDrawFitProposals({ ...args, drawSize: 32, sanctioned: false } as GetDrawFitProposalsArgs);
    expect(proposals(result).map((proposal) => proposal.kind)).toEqual(['Cut']);
  });
  it('does not offer a Cut that would exceed the alternate cap', () => {
    const args = fixture(40);
    limit(args, { maxAlternates: 7 });
    let result: any = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(proposals(result).some((proposal) => proposal.kind === 'Cut')).toBe(false);
    limit(args, { maxAlternates: 8 });
    result = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(proposals(result).some((proposal) => proposal.kind === 'Cut')).toBe(true);
  });
  it('honors the wildcard cap on each proposed acceptance', () => {
    const args = fixture(40);
    limit(args, { maxWildcards: 1 });
    args.event.entries!.slice(0, 2).forEach((entry) => {
      entry.entryStatus = WILDCARD;
    });
    let result: any = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(result.error).toBeDefined();
    expect(result.proposals).toBeUndefined();
    // An already invalid wildcard selection is refused before any proposal is offered.
    args.event.entries![1].entryStatus = DIRECT_ACCEPTANCE;
    result = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(proposals(result).length).toBeGreaterThan(0);
  });
  it('honors qualifier-slot limits while preserving all qualifying entries and stages', () => {
    const args = fixture(40, 8);
    limit(args, { maxQualifiers: 3 });
    const before = JSON.stringify(args.event);
    let result: any = getDrawFitProposals({
      ...args,
      drawSize: 32,
      qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
    });
    expect(proposals(result)).toEqual([]);
    expect(JSON.stringify(args.event)).toBe(before);
    limit(args, { maxQualifiers: 4 });
    result = getDrawFitProposals({
      ...args,
      drawSize: 32,
      qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
    });
    expect(proposals(result).length).toBeGreaterThan(0);
    expect(
      result.proposals
        .flatMap((proposal: any) => proposal.entryChanges)
        .every((change: any) => change.entryStage === MAIN),
    ).toBe(true);
  });
  it('reads legacy constraints and leaves unmatched events unconstrained', () => {
    const args = fixture(40);
    args.tournamentRecord.extensions = [
      { name: 'sanctioningConstraints', value: { events: [{ eventType: args.event.eventType, drawSize: 32 }] } },
    ];
    let result: any = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(proposals(result).some((proposal) => proposal.kind === 'Grow')).toBe(false);
    args.tournamentRecord.extensions[0].value.events[0].eventName = 'Another event';
    result = getDrawFitProposals({ ...args, drawSize: 32 });
    expect(proposals(result).some((proposal) => proposal.kind === 'Grow')).toBe(true);
  });
});

it('leaves engine state, caller arrays and the record unchanged; each fit can be independently reproduced', () => {
  const args = fixture(40);
  const before = JSON.stringify(args.tournamentRecord);
  const ranked = JSON.stringify(args.rankedEntries);
  let result: any = getDrawFitProposals({ ...args, drawSize: 32 });
  for (const proposal of proposals(result)) {
    const removed = new Set(proposal.entryChanges.map((change: any) => change.participantId));
    const drawEntries = args.event.entries!.map((entry) =>
      removed.has(entry.participantId) ? { ...entry, entryStatus: ALTERNATE } : entry,
    );
    const fit: any = tournamentEngine.getDrawFit({
      eventId: args.eventId,
      drawSize: proposal.drawSize,
      drawType: proposal.drawType,
      drawEntries,
    });
    expect(fit.structures.map(({ structureId: _id, ...value }: any) => value)).toEqual(
      proposal.fit.structures.map(({ structureId: _id, ...value }: any) => value),
    );
  }
  expect(JSON.stringify(args.tournamentRecord)).toBe(before);
  expect(JSON.stringify(args.rankedEntries)).toBe(ranked);
});

it('rejects missing context, invalid group sizes and incomplete or duplicate ranking', () => {
  expect(getDrawFitProposals({}).error).toBeDefined();
  expect(getDrawFitProposals({ tournamentRecord: { tournamentId: 'missing-event' } }).error).toBeDefined();
  const args = fixture(40);
  expect(getDrawFitProposals({ ...args, drawSize: 32, rankedEntries: [] }).error).toBeDefined();
  expect(
    getDrawFitProposals({ ...args, drawSize: 32, rankedEntries: [...args.rankedEntries, args.rankedEntries[0]] }).error,
  ).toBeDefined();
  expect(
    getDrawFitProposals({ ...args, drawSize: 32, drawType: ROUND_ROBIN, structureOptions: { groupSize: 1 } }).error,
  ).toBeDefined();
  expect(args.event.entries!.every((entry) => entry.entryStatus === DIRECT_ACCEPTANCE)).toBe(true);
});
