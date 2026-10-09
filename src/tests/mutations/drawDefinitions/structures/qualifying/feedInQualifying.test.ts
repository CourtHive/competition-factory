import { feedInQualifyingMatchUps, getFeedInQualifyingPositions } from '@Generators/drawDefinitions/feedInQualifying';
import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES, MISSING_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

/**
 * CA (2026-10-09): "If I have 12 entries at stage qualifying I should be able to create a drawSize of 12, for
 * instance, which has 8 in the first round of qualifying and 4 fed participants in the second round of qualifying,
 * producing 4 qualifiers; but if I had a qualifying draw of size 13 then it would only be possible to produce 1
 * qualiier because the final round of qualifying has to be at least the last fed round."
 * And: "We should be able to have a drawsize of 10 that produces 5 qualifiers!"
 * And, of seeds: "there are qualifying seeds that get the fed positions same pattern. we won't limit the number of
 * seeds, just place the lowest seeds in the feed arms."
 */

const SEEDING_SCALE = 'QS';

function setup({ qualifyingCount = 12, mainCount = 12, seedsCount = 0 } = {}) {
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: qualifyingCount + mainCount },
    eventProfiles: [{ eventName: 'Q' }],
  });
  tournamentEngine.setState(tournamentRecord);
  const participantIds = tournamentEngine.getParticipants().participants.map(getParticipantId);
  const qualifyingIds = participantIds.slice(0, qualifyingCount);
  if (mainCount) tournamentEngine.addEventEntries({ participantIds: participantIds.slice(qualifyingCount), eventId });
  tournamentEngine.addEventEntries({ participantIds: qualifyingIds, entryStage: QUALIFYING, eventId });
  generateRange(0, seedsCount).forEach((index) =>
    tournamentEngine.setParticipantScaleItem({
      scaleItem: { scaleName: SEEDING_SCALE, scaleType: SEEDING, eventType: SINGLES, scaleValue: index + 1 },
      participantId: qualifyingIds[index],
    }),
  );
  return { eventId, qualifyingIds, tournamentId: tournamentRecord.tournamentId };
}

function roundProfile(structure) {
  const counts: Record<number, number> = {};
  structure.matchUps.forEach(({ roundNumber }) => (counts[roundNumber] = (counts[roundNumber] ?? 0) + 1));
  return counts;
}

/** positions that first appear after round 1, by round: the fed positions */
function fedPositionsByRound(structure) {
  const seen = new Set<number>();
  const fed: Record<number, number[]> = {};
  const rounds = [...new Set<number>(structure.matchUps.map(({ roundNumber }) => roundNumber))].sort((a, b) => a - b);
  for (const roundNumber of rounds) {
    const positions = structure.matchUps
      .filter((matchUp) => matchUp.roundNumber === roundNumber)
      .flatMap(({ drawPositions }) => drawPositions ?? [])
      .filter(Boolean);
    const fresh = positions.filter((drawPosition) => !seen.has(drawPosition));
    if (roundNumber > 1 && fresh.length) fed[roundNumber] = fresh.sort((a, b) => a - b);
    positions.forEach((drawPosition) => seen.add(drawPosition));
  }
  return fed;
}

it.each([
  [12, [1, 2, 3, 4, 6]],
  [13, [1]],
  [10, [1, 2, 5]],
  [15, [1, 3, 5]],
  [24, [1, 2, 3, 4, 6, 8, 12]],
  [2, [1]],
  [1, []],
  [undefined, []],
])(
  'a FEED_IN qualifying of %s positions produces only qualifier counts that divide it twice over',
  (drawSize, expected) => {
    expect(getFeedInQualifyingPositions({ drawSize }).qualifyingPositions).toEqual(expected);
  },
);

it.each([
  // CA: 12 → 4 is 8 in round 1 and 4 fed into round 2
  { drawSize: 12, qualifyingPositions: 4, rounds: { 1: 4, 2: 4 }, fed: { 2: [1, 2, 3, 4] } },
  // CA: 13 produces only 1 qualifier; the final qualifying round is the last fed round
  { drawSize: 13, qualifyingPositions: 1, rounds: { 1: 4, 2: 4, 3: 2, 4: 1, 5: 1 }, fed: { 2: [2, 3, 4, 5], 5: [1] } },
  // CA: 10 → 5 is one round of 5 matchUps
  { drawSize: 10, qualifyingPositions: 5, rounds: { 1: 5 }, fed: {} },
  { drawSize: 15, qualifyingPositions: 5, rounds: { 1: 5, 2: 5 }, fed: { 2: [1, 2, 3, 4, 5] } },
  { drawSize: 12, qualifyingPositions: 2, rounds: { 1: 4, 2: 4, 3: 2 }, fed: { 2: [1, 2, 3, 4] } },
  { drawSize: 22, qualifyingPositions: 2, rounds: { 1: 8, 2: 4, 3: 4, 4: 2, 5: 2 } },
  { drawSize: 18, qualifyingPositions: 3, rounds: { 1: 6, 2: 6, 3: 3 }, fed: { 2: [1, 2, 3, 4, 5, 6] } },
])('a FEED_IN qualifying of $drawSize produces $qualifyingPositions qualifiers', (scenario) => {
  const { drawSize, qualifyingPositions, rounds, fed } = scenario;
  const { eventId } = setup({ qualifyingCount: drawSize, mainCount: 0 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: FEED_IN, drawSize, qualifyingPositions }] }],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(roundProfile(qualifying)).toEqual(rounds);
  if (fed) expect(fedPositionsByRound(qualifying)).toEqual(fed);

  const finalRound = Math.max(...Object.keys(rounds).map(Number));
  expect(qualifying.roundLimit).toEqual(finalRound);
  expect(qualifying.qualifyingRoundNumber).toEqual(finalRound);
  // every position holds an entry: no BYEs, nothing coerced to an even or power-of-2 size
  expect(qualifying.positionAssignments.length).toEqual(drawSize);
  expect(qualifying.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(drawSize);

  const link = result.drawDefinition.links.find((l) => l.source.structureId === qualifying.structureId);
  expect(link.source.roundNumber).toEqual(finalRound);
});

it.each([
  { drawSize: 13, qualifyingPositions: 4 },
  { drawSize: 12, qualifyingPositions: 5 },
  { drawSize: 10, qualifyingPositions: 10 },
  { drawSize: 12, qualifyingRoundNumber: 1 },
])('a FEED_IN qualifying refuses qualifiers before its last fed round: %o', (profile) => {
  const { eventId } = setup({ qualifyingCount: profile.drawSize, mainCount: 0 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: FEED_IN, ...profile }] }],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('a FEED_IN qualifying needs a draw size', () => {
  expect(feedInQualifyingMatchUps({ qualifyingPositions: 4 }).error).toEqual(MISSING_DRAW_SIZE);
});

it('a FEED_IN qualifying derives its qualifiers from qualifyingRoundNumber by its own rounds', () => {
  const { eventId } = setup({ qualifyingCount: 12, mainCount: 0 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: FEED_IN, drawSize: 12, qualifyingRoundNumber: 2 }] }],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(roundProfile(qualifying)).toEqual({ 1: 4, 2: 4 });
});

it('qualifying seeds take the fed positions, lowest seeds latest, and the rest spread across round 1', () => {
  const { eventId, qualifyingIds } = setup({ qualifyingCount: 13, mainCount: 0, seedsCount: 7 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          { drawType: FEED_IN, drawSize: 13, qualifyingPositions: 1, seedsCount: 7, seedingScaleName: SEEDING_SCALE },
        ],
      },
    ],
    // seeds beyond the seeding policy's limit for 13 entries
    enforcePolicyLimits: false,
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const positionOf = Object.fromEntries(
    qualifying.positionAssignments.map(({ participantId, drawPosition }) => [participantId, drawPosition]),
  );
  const seededPositions = qualifying.seedAssignments
    .toSorted((a, b) => a.seedNumber - b.seedNumber)
    .map(({ seedNumber, participantId }) => [seedNumber, positionOf[participantId]]);

  // seed 1 takes the one position fed into round 5, seeds 2–5 the four fed into round 2;
  // seeds 6 and 7 play round 1, in different halves
  expect(seededPositions[0]).toEqual([1, 1]);
  expect(
    seededPositions
      .slice(1, 5)
      .map(([, drawPosition]) => drawPosition)
      .sort((a, b) => a - b),
  ).toEqual([2, 3, 4, 5]);
  const [sixth, seventh] = seededPositions.slice(5).map(([, drawPosition]) => drawPosition);
  const firstRound = generateRange(6, 14);
  expect(firstRound).toContain(sixth);
  expect(firstRound).toContain(seventh);
  expect(sixth <= 9).not.toEqual(seventh <= 9);

  // the seeds are the participants seeded 1–7
  expect(qualifying.seedAssignments.map(({ participantId }) => participantId).sort()).toEqual(
    qualifyingIds.slice(0, 7).sort(),
  );
});

it('with fewer seeds than fed positions, the seeds take the fed positions and the rest go to unseeded entries', () => {
  const { eventId } = setup({ qualifyingCount: 12, mainCount: 0, seedsCount: 2 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          { drawType: FEED_IN, drawSize: 12, qualifyingPositions: 4, seedsCount: 2, seedingScaleName: SEEDING_SCALE },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  const seededIds = new Set(qualifying.seedAssignments.map(({ participantId }) => participantId));
  const seededPositions = qualifying.positionAssignments
    .filter(({ participantId }) => seededIds.has(participantId))
    .map(({ drawPosition }) => drawPosition)
    .sort((a, b) => a - b);
  // both seeds are fed into round 2
  expect(seededPositions.every((drawPosition) => drawPosition <= 4)).toEqual(true);
  expect(seededPositions.length).toEqual(2);
  expect(qualifying.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(12);
});

it('fewer entries than positions leaves BYEs, and every qualifier still has a path', () => {
  const { eventId } = setup({ qualifyingCount: 11, mainCount: 0 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: FEED_IN, drawSize: 12, qualifyingPositions: 4 }] }],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const qualifying = result.drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifying.positionAssignments.filter(({ bye }) => bye).length).toEqual(1);
  expect(qualifying.positionAssignments.filter(({ participantId }) => participantId).length).toEqual(11);
});

it('FEED_IN qualifiers progress into the main draw', () => {
  const { eventId, tournamentId } = setup({ qualifyingCount: 12, mainCount: 12 });
  const generation = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: FEED_IN, drawSize: 12, qualifyingPositions: 4 }] }],
    drawSize: 16,
    eventId,
  });
  expect(generation.success).toEqual(true);
  const { drawDefinition } = generation;
  expect(tournamentEngine.addDrawDefinition({ drawDefinition, eventId }).success).toEqual(true);
  const { drawId } = drawDefinition;

  const qualifyingMatchUps = () =>
    tournamentEngine.allTournamentMatchUps().matchUps.filter(({ stage }) => stage === QUALIFYING);
  expect(qualifyingMatchUps().length).toEqual(8);

  // score every qualifying matchUp, round by round, as each becomes ready
  for (let pass = 0; pass < 3; pass++) {
    qualifyingMatchUps()
      .filter(({ readyToScore, winningSide }) => readyToScore && !winningSide)
      .forEach(({ matchUpId }) =>
        tournamentEngine.setMatchUpStatus({
          outcome: { winningSide: 1 },
          matchUpStatus: COMPLETED,
          matchUpId,
          drawId,
        }),
      );
  }
  expect(qualifyingMatchUps().every(({ winningSide }) => winningSide)).toEqual(true);

  const progression = tournamentEngine.qualifierProgression({
    randomList: tournamentEngine.getRandomQualifierList({ drawDefinition }),
    targetRoundNumber: 1,
    tournamentId,
    eventId,
    drawId,
  });
  expect(progression.success).toEqual(true);
  expect(progression.assignedParticipants.length).toEqual(4);

  const main = tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(main.positionAssignments.filter(({ qualifier, participantId }) => qualifier && participantId).length).toEqual(
    4,
  );
});

it('a FEED_IN qualifying structure can be added to an existing main', () => {
  const { eventId } = setup({ qualifyingCount: 12, mainCount: 12 });
  const generation = tournamentEngine.generateDrawDefinition({ drawSize: 16, qualifiersCount: 4, eventId });
  expect(tournamentEngine.addDrawDefinition({ drawDefinition: generation.drawDefinition, eventId }).success).toEqual(
    true,
  );
  const { drawId } = generation.drawDefinition;
  const mainStructureId = generation.drawDefinition.structures[0].structureId;

  let result: any = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 5,
    drawType: FEED_IN,
    drawSize: 12,
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.generateQualifyingStructure({
    targetStructureId: mainStructureId,
    qualifyingPositions: 4,
    drawType: FEED_IN,
    drawSize: 12,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(result.qualifiersCount).toEqual(4);
  expect(roundProfile(result.structure)).toEqual({ 1: 4, 2: 4 });
  expect(result.link.source.roundNumber).toEqual(2);

  result = tournamentEngine.attachQualifyingStructure({ structure: result.structure, link: result.link, drawId });
  expect(result.success).toEqual(true);
});

it('a ROUND_ROBIN qualifying is unchanged by the FEED_IN branch', () => {
  const { eventId } = setup({ qualifyingCount: 12, mainCount: 0 });
  const result = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ drawType: ROUND_ROBIN, drawSize: 12 }] }],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
});
