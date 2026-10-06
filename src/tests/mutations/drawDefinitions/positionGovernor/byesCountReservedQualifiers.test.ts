import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN } from '@Constants/drawDefinitionConstants';

// a qualifiersCount with no qualifying structure behind it still reserves its positions,
// so the draw needs only drawSize - (entries + qualifiers) byes
it.each([
  { participantsCount: 28, qualifiersCount: 4, byes: 0 },
  { participantsCount: 24, qualifiersCount: 4, byes: 4 },
])('byes count the qualifier positions a qualifiersCount reserves: %j', (scenario) => {
  const { participantsCount, qualifiersCount, byes } = scenario;
  const {
    tournamentId,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({ drawSize: 32, qualifiersCount, tournamentId, eventId });
  expect(result.success).toEqual(true);

  const structure = result.drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const assignments = structure.positionAssignments;
  expect(assignments.filter(({ qualifier }) => qualifier)).toHaveLength(qualifiersCount);
  expect(assignments.filter(({ bye }) => bye)).toHaveLength(byes);
  expect(assignments.filter(({ participantId }) => participantId)).toHaveLength(participantsCount);
});
