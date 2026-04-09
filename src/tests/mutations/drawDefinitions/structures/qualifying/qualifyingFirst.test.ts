import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, SINGLE_ELIMINATION, WINNER } from '@Constants/drawDefinitionConstants';

it('can generate qualifying-first draw via generateDrawDefinition with automated positioning', () => {
  // Create a tournament with participants
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 40 },
    setState: true,
  });
  expect(result.success).toEqual(true);

  // Add an event with qualifying and main entries
  const { participants } = tournamentEngine.getParticipants();
  const eventId = 'test-event';
  tournamentEngine.addEvent({ event: { eventId, eventName: 'Test Event', eventType: 'SINGLES' } });

  // Add 16 qualifying entries and 24 main entries
  const qualifyingParticipantIds = participants.slice(0, 16).map((p) => p.participantId);
  const mainParticipantIds = participants.slice(16, 40).map((p) => p.participantId);

  tournamentEngine.addEventEntries({
    participantIds: qualifyingParticipantIds,
    entryStage: QUALIFYING,
    eventId,
  });
  tournamentEngine.addEventEntries({
    participantIds: mainParticipantIds,
    entryStage: MAIN,
    eventId,
  });

  // Generate qualifying-first draw: qualifyingOnly with qualifyingProfiles, passing drawEntries
  const { event } = tournamentEngine.getEvent({ eventId });
  const qualifyingEntries = event.entries.filter((e) => e.entryStage === QUALIFYING);

  const genResult = tournamentEngine.generateDrawDefinition({
    qualifyingOnly: true,
    drawEntries: qualifyingEntries,
    automated: true,
    eventId,
    drawName: 'Draw 1',
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: 4,
            drawSize: 16,
            drawType: SINGLE_ELIMINATION,
          },
        ],
      },
    ],
  });

  expect(genResult.success).toEqual(true);
  const drawDefinition = genResult.drawDefinition;

  // Verify structures created
  const qualifyingStructure = drawDefinition.structures.find((s) => s.stage === QUALIFYING);
  const mainStructure = drawDefinition.structures.find((s) => s.stage === MAIN);
  expect(qualifyingStructure).toBeDefined();
  expect(mainStructure).toBeDefined();

  // MAIN should be a placeholder (no matchUps)
  expect(mainStructure.matchUps.length).toEqual(0);

  // QUALIFYING should have matchUps
  expect(qualifyingStructure.matchUps.length).toBeGreaterThan(0);

  // Links should exist
  expect(drawDefinition.links.length).toEqual(1);
  expect(drawDefinition.links[0].linkType).toEqual(WINNER);
  expect(drawDefinition.links[0].source.structureId).toEqual(qualifyingStructure.structureId);
  expect(drawDefinition.links[0].target.structureId).toEqual(mainStructure.structureId);

  // CRITICAL: Entries should be in the drawDefinition
  expect(drawDefinition.entries.length).toEqual(16);

  // CRITICAL: Qualifying structure should have positionAssignments with participants
  const assignedPositions = qualifyingStructure.positionAssignments.filter((pa) => pa.participantId);
  expect(assignedPositions.length).toEqual(16);

  // Add draw to event and verify it can be retrieved
  const addResult = tournamentEngine.addDrawDefinition({
    drawDefinition,
    eventId,
  });
  expect(addResult.success).toEqual(true);

  // Now generate the MAIN structure
  const drawId = drawDefinition.drawId;
  const mainResult = tournamentEngine.generateDrawDefinition({
    drawSize: 32,
    drawId,
  });
  expect(mainResult.success).toEqual(true);

  // Replace with the populated draw
  const replaceResult = tournamentEngine.addDrawDefinition({
    drawDefinition: mainResult.drawDefinition,
    allowReplacement: true,
    eventId,
  });
  expect(replaceResult.success).toEqual(true);

  // Verify MAIN now has matchUps
  const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });
  const finalMain = finalDraw.structures.find((s) => s.stage === MAIN);
  expect(finalMain.matchUps.length).toBeGreaterThan(0);

  // Qualifying structure should still exist with its matchUps
  const finalQualifying = finalDraw.structures.find((s) => s.stage === QUALIFYING);
  expect(finalQualifying.matchUps.length).toBeGreaterThan(0);

  // Links should still be preserved
  expect(finalDraw.links.length).toEqual(1);
});
