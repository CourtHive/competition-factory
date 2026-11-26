import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

/** The round each draw position first plays in. */
function entryRounds(structure: any): Map<number, number> {
  const entered = new Map<number, number>();
  for (const { roundNumber, drawPositions } of structure.matchUps)
    for (const drawPosition of drawPositions ?? [])
      if (drawPosition) entered.set(drawPosition, Math.min(entered.get(drawPosition) ?? Infinity, roundNumber));
  return entered;
}

/** How many positions enter in each round: { 1: 32, 3: 8, 4: 8 }. */
function countByRound(entered: Map<number, number>): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const roundNumber of entered.values()) counts[roundNumber] = (counts[roundNumber] ?? 0) + 1;
  return counts;
}

function eventWith(participantsCount: number) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'Feed rounds', eventType: SINGLES } });
  return { eventId: event.eventId, participantIds };
}

it('a FEED_IN draw enters its fed positions in the rounds the profile names', () => {
  const { eventId, participantIds } = eventWith(40);
  tournamentEngine.addEventEntries({ eventId, participantIds });

  const generate = (feedRoundsProfile?: number[]) =>
    tournamentEngine.generateDrawDefinition({
      structureOptions: feedRoundsProfile ? { feedRoundsProfile } : undefined,
      drawType: FEED_IN,
      drawSize: 48,
      eventId,
    });

  // the default 48: 16 enter at R2
  let result: any = generate();
  expect(countByRound(entryRounds(result.drawDefinition.structures[0]))).toEqual({ 1: 32, 2: 16 });

  // stacked: 8 at R3, then 8 at R4
  result = generate([8, 8]);
  expect(countByRound(entryRounds(result.drawDefinition.structures[0]))).toEqual({ 1: 32, 3: 8, 4: 8 });

  // a profile that is not a 48: too few fed positions, a size no base round has, not an array
  for (const feedRoundsProfile of [[8], [12, 4], 'eight' as any]) {
    result = generate(feedRoundsProfile);
    expect(result.error).toEqual(INVALID_VALUES);
  }
});

it('seeds take the latest feed round, and qualifiers routed to R3 the round before it', () => {
  // a staggered qualifying event (generated): 24 direct entries (8 seeded), a stronger qualifying field of 16 for R3,
  // a weaker of 32 for R1
  const { eventId, participantIds } = eventWith(24 + 16 + 32);
  const direct = participantIds.slice(0, 24);
  const stronger = participantIds.slice(24, 40);
  const weaker = participantIds.slice(40);
  tournamentEngine.addEventEntries({ eventId, participantIds: direct });
  tournamentEngine.addEventEntries({ eventId, participantIds: stronger, entryStage: QUALIFYING, roundTarget: 3 });
  tournamentEngine.addEventEntries({ eventId, participantIds: weaker, entryStage: QUALIFYING, roundTarget: 1 });

  const scaleName = 'FEED';
  const seeded = direct.slice(0, 8);
  tournamentEngine.setParticipantScaleItems({
    scaleItemsWithParticipantIds: seeded.map((participantId, i) => ({
      participantId,
      scaleItems: [{ scaleType: SEEDING, eventType: SINGLES, scaleName, scaleValue: i + 1 }],
    })),
  });

  const result: any = tournamentEngine.generateDrawDefinition({
    structureOptions: { feedRoundsProfile: [8, 8] },
    seedingScaleName: scaleName,
    qualifyingProfiles: [
      { roundTarget: 3, structureProfiles: [{ drawSize: 16, qualifyingPositions: 8 }] },
      { roundTarget: 1, structureProfiles: [{ drawSize: 32, qualifyingPositions: 8 }] },
    ],
    drawType: FEED_IN,
    seedsCount: 8,
    drawSize: 48,
    eventId,
  });
  expect(result.error).toBeUndefined();

  const main = result.drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const entered = entryRounds(main);
  const roundsOf = (assignments: any[]) => assignments.map(({ drawPosition }) => entered.get(drawPosition));

  const seeds = main.positionAssignments.filter(({ participantId }) => seeded.includes(participantId));
  expect(seeds.length).toEqual(8);
  expect(new Set(roundsOf(seeds))).toEqual(new Set([4]));

  const qualifiers = main.positionAssignments.filter(({ qualifier }) => qualifier);
  expect(
    countByRound(new Map(qualifiers.map(({ drawPosition }) => [drawPosition, entered.get(drawPosition)!]))),
  ).toEqual({
    1: 8,
    3: 8,
  });

  // every direct entry is placed: 8 seeds in R4, the other 16 in R1 with the weaker field's qualifiers and 8 BYEs
  const placed = main.positionAssignments.filter(({ participantId }) => direct.includes(participantId));
  expect(placed.length).toEqual(24);
  expect(main.positionAssignments.filter(({ bye }) => bye).length).toEqual(8);
});
