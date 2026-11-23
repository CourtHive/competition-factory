import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INSUFFICIENT_DRAW_POSITIONS } from '@Constants/errorConditionConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

it('a draw whose direct entries and qualifiers exceed its drawSize is refused', () => {
  const {
    tournamentId,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 32 } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({ drawSize: 32, qualifiersCount: 4, tournamentId, eventId });
  expect(result.error).toEqual(INSUFFICIENT_DRAW_POSITIONS);
  expect(result.context).toEqual({ drawSize: 32, directEntriesCount: 32, qualifiersCount: 4 });
});

it('a draw whose direct entries and qualifiers fill its drawSize is generated', () => {
  const {
    tournamentId,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: 28 } }],
    setState: true,
  });

  const result = tournamentEngine.generateDrawDefinition({ drawSize: 32, qualifiersCount: 4, tournamentId, eventId });
  expect(result.success).toEqual(true);
});

it('mocksEngine enters drawSize - qualifiersCount direct participants and places all of them', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, qualifiersCount: 4 }],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const assignments = drawDefinition.structures.find(({ stage }) => stage === MAIN).positionAssignments;
  expect(assignments.filter(({ participantId }) => participantId)).toHaveLength(28);
  expect(assignments.filter(({ qualifier }) => qualifier)).toHaveLength(4);
});
