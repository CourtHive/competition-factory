/**
 * Tests for the two-step draw generation flow used by TMX:
 * 1. Generate MAIN draw with qualifyingPlaceholder → verify participants are positioned
 * 2. Generate qualifying structure → verify qualifying participants positioned, main preserved
 *
 * Reproduces the scenario: 29 MAIN entries, 11-12 QUALIFYING entries, drawSize 32, 3 qualifiers
 */
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { LUCKY_DRAW, MAIN, QUALIFYING, SWISS } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

function setupTournamentWithEntries({
  mainEntryCount = 29,
  qualifyingEntryCount = 12,
}: {
  mainEntryCount?: number;
  qualifyingEntryCount?: number;
} = {}) {
  const totalParticipants = mainEntryCount + qualifyingEntryCount;

  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: totalParticipants },
  });
  expect(result.success).toEqual(true);
  tournamentEngine.setState(result.tournamentRecord);

  const eventResult = tournamentEngine.addEvent({
    event: { eventName: 'Test Singles', eventType: SINGLES_EVENT },
  });
  expect(eventResult.success).toEqual(true);
  const eventId = eventResult.event.eventId;

  const { participants } = tournamentEngine.getParticipants();
  const mainParticipantIds = participants.slice(0, mainEntryCount).map((p: any) => p.participantId);
  const qualifyingParticipantIds = participants
    .slice(mainEntryCount, mainEntryCount + qualifyingEntryCount)
    .map((p: any) => p.participantId);

  let addResult = tournamentEngine.addEventEntries({
    participantIds: mainParticipantIds,
    entryStage: MAIN,
    eventId,
  });
  expect(addResult.success).toEqual(true);

  addResult = tournamentEngine.addEventEntries({
    participantIds: qualifyingParticipantIds,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(addResult.success).toEqual(true);

  return { eventId, mainParticipantIds, qualifyingParticipantIds };
}

describe('qualifying placeholder positioning: TMX two-step flow', () => {
  it('positions all participants in main draw when generating with qualifyingPlaceholder', () => {
    const mainEntryCount = 29;
    const qualifiersCount = 3;
    const drawSize = 32;

    const { eventId, mainParticipantIds } = setupTournamentWithEntries({ mainEntryCount });

    // Get the MAIN entries as TMX does (filter to MAIN + DIRECT_ACCEPTANCE)
    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => (!e.entryStage || e.entryStage === MAIN) && e.entryStatus === DIRECT_ACCEPTANCE,
    );
    expect(mainDrawEntries.length).toEqual(mainEntryCount);

    // Step 4: Generate main draw with qualifyingPlaceholder (same as TMX first call)
    const genResult = tournamentEngine.generateDrawDefinition({
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      qualifiersCount,
      automated: true,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);

    const { drawDefinition } = genResult;

    // Add draw to event (as TMX does via mutation)
    const addDrawResult = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(addDrawResult.success).toEqual(true);

    // Verify main structure
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainStructure).toBeDefined();
    expect(mainStructure.positionAssignments.length).toEqual(drawSize);

    // Verify qualifier positions are reserved
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(qualifiersCount);

    // **KEY ASSERTION**: Verify all main participants are positioned
    const positionedParticipantIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedParticipantIds.length).toEqual(mainEntryCount);

    // Every main participant should have a position
    for (const pid of mainParticipantIds) {
      expect(positionedParticipantIds).toContain(pid);
    }

    // Byes: drawSize - mainEntryCount - qualifiersCount = 32 - 29 - 3 = 0
    const byePositions = mainStructure.positionAssignments.filter((pa: any) => pa.bye);
    expect(byePositions.length).toEqual(drawSize - mainEntryCount - qualifiersCount);
  });

  it('positions participants in both structures in full two-step flow', () => {
    const mainEntryCount = 29;
    const qualifyingEntryCount = 12;
    const qualifiersCount = 3;
    const drawSize = 32;
    const qualifyingDrawSize = 16;

    const { eventId, qualifyingParticipantIds } = setupTournamentWithEntries({
      qualifyingEntryCount,
      mainEntryCount,
    });

    // Step 1: Generate main draw with qualifyingPlaceholder
    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => (!e.entryStage || e.entryStage === MAIN) && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    const genResult = tournamentEngine.generateDrawDefinition({
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      qualifiersCount,
      automated: true,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);

    const drawId = genResult.drawDefinition.drawId;
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: genResult.drawDefinition });

    // Verify main positioning after step 1
    let { drawDefinition } = tournamentEngine.getEvent({ drawId });
    let mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    let positionedMainIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedMainIds.length).toEqual(mainEntryCount);

    // Step 2: Generate qualifying structure (same as TMX second call)
    const qualifyingDrawEntries = tournamentEngine
      .getEvent({ eventId })
      .event.entries.filter((e: any) => e.entryStage === QUALIFYING && e.entryStatus === DIRECT_ACCEPTANCE);
    expect(qualifyingDrawEntries.length).toEqual(qualifyingEntryCount);

    const qualGenResult = tournamentEngine.generateDrawDefinition({
      drawEntries: qualifyingDrawEntries,
      qualifyingProfiles: [
        {
          structureProfiles: [
            {
              qualifyingPositions: qualifiersCount,
              drawSize: qualifyingDrawSize,
              stageSequence: 1,
            },
          ],
        },
      ],
      automated: true,
      drawSize,
      eventId,
      drawId,
    });
    expect(qualGenResult.success).toEqual(true);

    // Replace draw with the updated one
    tournamentEngine.addDrawDefinition({
      eventId,
      drawDefinition: qualGenResult.drawDefinition,
      allowReplacement: true,
    });

    // Verify both structures after step 2
    ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));

    // Main structure: all participants should still be positioned
    mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    positionedMainIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedMainIds.length).toEqual(mainEntryCount);

    // Main: qualifier positions should still be reserved
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(qualifiersCount);

    // Qualifying structure: should exist with matchUps
    const qualifyingStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualifyingStructure).toBeDefined();
    expect(qualifyingStructure.matchUps.length).toBeGreaterThan(0);

    // Qualifying structure: participants should be positioned
    const positionedQualifyingIds = qualifyingStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedQualifyingIds.length).toEqual(qualifyingEntryCount);

    // Every qualifying participant should have a position
    for (const pid of qualifyingParticipantIds) {
      expect(positionedQualifyingIds).toContain(pid);
    }
  });

  it('positions seeded and unseeded participants with qualifyingPlaceholder', () => {
    const mainEntryCount = 29;
    const qualifiersCount = 3;
    const drawSize = 32;
    const seedsCount = 8;

    const { eventId, mainParticipantIds } = setupTournamentWithEntries({ mainEntryCount });

    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => (!e.entryStage || e.entryStage === MAIN) && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    // Create seeded participants from the first 8 main participants
    const seededParticipants = mainParticipantIds.slice(0, seedsCount).map((participantId: string, i: number) => ({
      participantId,
      seedNumber: i + 1,
      seedValue: `${i + 1}`,
    }));

    const genResult = tournamentEngine.generateDrawDefinition({
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      seededParticipants,
      qualifiersCount,
      automated: true,
      seedsCount,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);

    const { drawDefinition } = genResult;
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);

    // Verify qualifier positions
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(qualifiersCount);

    // **KEY ASSERTION**: ALL participants (seeded + unseeded) should be positioned
    const positionedParticipantIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedParticipantIds.length).toEqual(mainEntryCount);

    // Every main participant should have a position
    for (const pid of mainParticipantIds) {
      expect(positionedParticipantIds).toContain(pid);
    }

    // Verify seeds are assigned
    const seedAssignments = mainStructure.seedAssignments?.filter((sa: any) => sa.participantId);
    expect(seedAssignments?.length).toEqual(seedsCount);
  });

  it('handles 11 qualifying participants (odd count)', () => {
    const mainEntryCount = 29;
    const qualifyingEntryCount = 11;
    const qualifiersCount = 3;
    const drawSize = 32;

    const { eventId, mainParticipantIds } = setupTournamentWithEntries({
      mainEntryCount,
      qualifyingEntryCount,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => (!e.entryStage || e.entryStage === MAIN) && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    const genResult = tournamentEngine.generateDrawDefinition({
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      qualifiersCount,
      automated: true,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);

    const { drawDefinition } = genResult;
    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);

    // All main participants positioned
    const positionedParticipantIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedParticipantIds.length).toEqual(mainEntryCount);

    for (const pid of mainParticipantIds) {
      expect(positionedParticipantIds).toContain(pid);
    }
  });

  it('positions all participants in lucky draw with qualifyingPlaceholder', () => {
    const mainEntryCount = 27;
    const qualifyingEntryCount = 11;
    const qualifiersCount = 3;
    const drawSize = 30; // 27 entries + 3 qualifiers

    const { eventId, mainParticipantIds } = setupTournamentWithEntries({
      qualifyingEntryCount,
      mainEntryCount,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => (!e.entryStage || e.entryStage === MAIN) && e.entryStatus === DIRECT_ACCEPTANCE,
    );
    expect(mainDrawEntries.length).toEqual(mainEntryCount);

    const genResult = tournamentEngine.generateDrawDefinition({
      drawType: LUCKY_DRAW,
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      qualifiersCount,
      automated: true,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);

    const { drawDefinition } = genResult;

    // Verify it's actually a lucky draw
    expect(drawDefinition.drawType).toEqual(LUCKY_DRAW);

    const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainStructure).toBeDefined();
    expect(mainStructure.positionAssignments.length).toEqual(drawSize);

    // Verify qualifier positions are reserved
    const qualifierPositions = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierPositions.length).toEqual(qualifiersCount);

    // All main participants should be positioned
    const positionedParticipantIds = mainStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedParticipantIds.length).toEqual(mainEntryCount);

    for (const pid of mainParticipantIds) {
      expect(positionedParticipantIds).toContain(pid);
    }

    // No byes: 30 - 27 - 3 = 0
    const byePositions = mainStructure.positionAssignments.filter((pa: any) => pa.bye);
    expect(byePositions.length).toEqual(0);
  });

  it('Swiss draw with qualifying: full two-step flow with getEventData', () => {
    const mainEntryCount = 29;
    const qualifyingEntryCount = 9;
    const qualifiersCount = 3;
    const drawSize = 32;
    const qualifyingDrawSize = 16;

    const { eventId, qualifyingParticipantIds } = setupTournamentWithEntries({
      mainEntryCount,
      qualifyingEntryCount,
    });

    const { event } = tournamentEngine.getEvent({ eventId });
    const mainDrawEntries = event.entries.filter(
      (e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    // Step 1: Swiss main + qualifying placeholder
    const genResult = tournamentEngine.generateDrawDefinition({
      drawType: SWISS,
      drawEntries: mainDrawEntries,
      qualifyingPlaceholder: true,
      qualifiersCount,
      automated: false,
      ignoreStageSpace: true,
      drawSize,
      eventId,
    });
    expect(genResult.success).toEqual(true);
    expect(genResult.drawDefinition.drawType).toEqual(SWISS);

    const drawId = genResult.drawDefinition.drawId;
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: genResult.drawDefinition });

    // Swiss main should have positionAssignments and qualifier reservations
    let { drawDefinition } = tournamentEngine.getEvent({ drawId });
    let mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
    expect(mainStructure.positionAssignments.length).toEqual(drawSize);
    expect(mainStructure.positionAssignments.filter((pa: any) => pa.qualifier).length).toEqual(qualifiersCount);

    // getEventData should not crash
    let eventData = tournamentEngine.getEventData({ eventId });
    expect(eventData.eventData?.drawsData?.length).toBeGreaterThan(0);

    // Step 2: Generate qualifying structure
    const qualDrawEntries = tournamentEngine.getEvent({ eventId }).event.entries.filter(
      (e: any) => e.entryStage === QUALIFYING && e.entryStatus === DIRECT_ACCEPTANCE,
    );

    const qualGenResult = tournamentEngine.generateDrawDefinition({
      drawEntries: qualDrawEntries,
      qualifyingProfiles: [
        { structureProfiles: [{ qualifyingPositions: qualifiersCount, drawSize: qualifyingDrawSize, stageSequence: 1 }] },
      ],
      automated: true,
      drawSize,
      eventId,
      drawId,
      ignoreStageSpace: true,
    });
    expect(qualGenResult.success).toEqual(true);

    // drawType must be preserved as SWISS
    expect(qualGenResult.drawDefinition.drawType).toEqual(SWISS);

    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: qualGenResult.drawDefinition, allowReplacement: true });

    // Qualifying structure should have matchUps with roundPosition and drawPositions
    ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
    const qualStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);
    expect(qualStructure.matchUps.length).toBeGreaterThan(0);
    expect(qualStructure.matchUps.every((m: any) => m.roundPosition)).toEqual(true);
    expect(qualStructure.matchUps.every((m: any) => m.drawPositions?.length)).toEqual(true);

    // Qualifying participants should be positioned
    const positionedQualIds = qualStructure.positionAssignments
      .filter((pa: any) => pa.participantId)
      .map((pa: any) => pa.participantId);
    expect(positionedQualIds.length).toEqual(qualifyingEntryCount);
    for (const pid of qualifyingParticipantIds) {
      expect(positionedQualIds).toContain(pid);
    }

    // getEventData should still work with qualifying added
    eventData = tournamentEngine.getEventData({ eventId });
    expect(eventData.eventData?.drawsData?.length).toBeGreaterThan(0);
  });
});
