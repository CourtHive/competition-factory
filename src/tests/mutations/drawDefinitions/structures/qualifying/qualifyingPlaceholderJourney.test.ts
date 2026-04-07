// Engines
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// Testing
import { expect, it, describe } from 'vitest';

// Constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';

describe('two-step qualifying journey: MAIN first, qualifying later', () => {
  it('preserves qualifiersCount on placeholder link and reserves positions in MAIN', () => {
    const qualifiersCount = 4;
    const participantsCount = 44;

    // Step 1: Generate MAIN with qualifyingPlaceholder
    let result: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount },
      drawProfiles: [
        {
          qualifyingPlaceholder: true,
          participantsCount: 28,
          qualifiersCount,
          drawSize: 32,
        },
      ],
    });
    expect(result.success).toEqual(true);

    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = result;

    tournamentEngine.setState(tournamentRecord);

    let { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.length).toEqual(2);

    // Verify MAIN structure exists with 32 positions
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainStructure).toBeDefined();
    expect(mainStructure.positionAssignments.length).toEqual(32);

    // Verify qualifier positions are reserved in MAIN
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(qualifiersCount);

    // Verify placeholder qualifying structure exists
    const placeholderStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(placeholderStructure).toBeDefined();

    // Verify the placeholder link has qualifyingPositions metadata
    const placeholderLink = drawDefinition.links.find(
      (link: any) => link.source.structureId === placeholderStructure.structureId,
    );
    expect(placeholderLink).toBeDefined();
    expect(placeholderLink.source.roundNumber).toEqual(0);
    expect(placeholderLink.source.qualifyingPositions).toEqual(qualifiersCount);

    // Step 2: Add qualifying entries
    const { participants } = tournamentEngine.getParticipants();
    const enteredIds = new Set(
      tournamentEngine.getEvent({ drawId }).event.entries.map((e: any) => e.participantId),
    );
    const qualifyingParticipantIds = participants
      .map((p: any) => p.participantId)
      .filter((id: string) => !enteredIds.has(id))
      .slice(0, 12);

    result = tournamentEngine.addEventEntries({
      participantIds: qualifyingParticipantIds,
      entryStage: QUALIFYING,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Step 3: Generate actual qualifying structure
    const drawEntries = tournamentEngine
      .getEvent({ drawId })
      .event.entries.filter((e: any) => e.entryStatus === DIRECT_ACCEPTANCE);

    result = tournamentEngine.generateDrawDefinition({
      drawEntries,
      qualifyingProfiles: [
        { structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }] },
      ],
      drawSize: 32,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify the regenerated draw has proper qualifying
    ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
    const newMainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const newQualifyingStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);

    expect(newMainStructure).toBeDefined();
    expect(newQualifyingStructure).toBeDefined();

    // Main should still have qualifier positions reserved
    const newQualifierPositions = newMainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(newQualifierPositions.length).toEqual(qualifiersCount);

    // Qualifying structure should have real matchUps
    expect(newQualifyingStructure.matchUps.length).toBeGreaterThan(0);

    // Links should connect qualifying to main
    const qualifyingLink = drawDefinition.links.find(
      (link: any) =>
        link.source.structureId === newQualifyingStructure.structureId &&
        link.target.structureId === newMainStructure.structureId,
    );
    expect(qualifyingLink).toBeDefined();
    expect(qualifyingLink.source.roundNumber).toBeGreaterThan(0);
  });

  it('works without qualifiersCount (unconstrained placeholder)', () => {
    let result: any = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 32 },
      drawProfiles: [
        {
          qualifyingPlaceholder: true,
          participantsCount: 28,
          drawSize: 32,
        },
      ],
    });
    expect(result.success).toEqual(true);

    const { drawIds: [drawId] } = result;
    tournamentEngine.setState(result.tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);

    // Without qualifiersCount, no qualifier positions should be reserved
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(0);

    // Placeholder link should exist but without qualifyingPositions
    const placeholderStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    const placeholderLink = drawDefinition.links.find(
      (link: any) => link.source.structureId === placeholderStructure.structureId,
    );
    expect(placeholderLink.source.qualifyingPositions).toBeUndefined();
  });
});
