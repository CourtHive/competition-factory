/**
 * Qualifying-first user journey: the flow where a tournament director generates the
 * qualifying structure BEFORE generating the main draw.
 *
 * Step 1 — Generate qualifying only:
 *   generateDrawDefinition({ qualifyingOnly: true, qualifyingProfiles, drawEntries })
 *   ↳ creates drawDefinition with a populated QUALIFYING structure + empty MAIN placeholder
 *     + WINNER link from qualifying final round → MAIN round 1
 *
 * Step 2 — Populate main:
 *   generateDrawDefinition({ drawId, drawType, drawSize, drawEntries, qualifyingPlaceholder,
 *                            qualifiersCount, seedsCount, automated })
 *   ↳ fills the MAIN placeholder with the chosen draw type, positions all entries,
 *     reserves qualifier spots, preserves the existing qualifying structure and link.
 *
 * These tests cover the factory contract for both steps and several main draw types.
 */
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants and types
import {
  LUCKY_DRAW,
  MAIN,
  QUALIFYING,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  SWISS,
} from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

type Setup = {
  eventId: string;
  drawId: string;
  mainIds: string[];
  qualIds: string[];
};

function setupQualifyingFirstDraw({
  mainCount = 28,
  qualCount = 12,
  qualifiersCount = 3,
  qualifyingDrawSize = 12,
}: {
  mainCount?: number;
  qualCount?: number;
  qualifiersCount?: number;
  qualifyingDrawSize?: number;
} = {}): Setup {
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: mainCount + qualCount },
  });
  tournamentEngine.setState(result.tournamentRecord);
  const eventResult = tournamentEngine.addEvent({
    event: { eventName: 'Test', eventType: SINGLES_EVENT },
  });
  const eventId = eventResult.event.eventId;
  const { participants } = tournamentEngine.getParticipants();
  const mainIds = participants.slice(0, mainCount).map((p: any) => p.participantId);
  const qualIds = participants.slice(mainCount, mainCount + qualCount).map((p: any) => p.participantId);
  tournamentEngine.addEventEntries({ participantIds: mainIds, entryStage: MAIN, eventId });
  tournamentEngine.addEventEntries({ participantIds: qualIds, entryStage: QUALIFYING, eventId });

  const qualDrawEntries = tournamentEngine
    .getEvent({ eventId })
    .event.entries.filter((e: any) => e.entryStage === QUALIFYING && e.entryStatus === DIRECT_ACCEPTANCE);

  const step1 = tournamentEngine.generateDrawDefinition({
    drawEntries: qualDrawEntries,
    qualifyingOnly: true,
    automated: true,
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: qualifiersCount,
            drawSize: qualifyingDrawSize,
            drawType: SINGLE_ELIMINATION,
            stageSequence: 1,
          },
        ],
      },
    ],
    ignoreStageSpace: true,
    eventId,
  });
  expect(step1.success).toEqual(true);
  const drawId = step1.drawDefinition.drawId;
  tournamentEngine.addDrawDefinition({ eventId, drawDefinition: step1.drawDefinition });

  return { eventId, drawId, mainIds, qualIds };
}

describe('qualifying-first user journey', () => {
  describe('step 1 — generate qualifying only', () => {
    it('creates qualifying structure with positioned participants and empty MAIN placeholder', () => {
      const { drawId, qualIds } = setupQualifyingFirstDraw();

      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      expect(drawDefinition.structures.length).toEqual(2);

      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      const qualStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);

      // MAIN is an empty placeholder
      expect(mainStructure.matchUps.length).toEqual(0);
      expect(mainStructure.positionAssignments.length).toEqual(0);

      // QUALIFYING is populated
      expect(qualStructure.matchUps.length).toBeGreaterThan(0);
      const positionedQual = qualStructure.positionAssignments.filter((pa: any) => pa.participantId);
      expect(positionedQual.length).toEqual(qualIds.length);
      for (const pid of qualIds) {
        expect(positionedQual.some((pa: any) => pa.participantId === pid)).toEqual(true);
      }

      // Exactly one WINNER link from qualifying final round to MAIN round 1
      expect(drawDefinition.links.length).toEqual(1);
      const link = drawDefinition.links[0];
      expect(link.linkType).toEqual('WINNER');
      expect(link.source.structureId).toEqual(qualStructure.structureId);
      expect(link.target.structureId).toEqual(mainStructure.structureId);
      expect(link.source.roundNumber).toEqual(qualStructure.qualifyingRoundNumber);
    });

    it('only includes QUALIFYING entries on the drawDefinition', () => {
      const { drawId } = setupQualifyingFirstDraw();
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      // drawDefinition.entries should only contain QUALIFYING entries
      const stages = new Set(drawDefinition.entries.map((e: any) => e.entryStage));
      expect(stages.has(QUALIFYING)).toEqual(true);
      expect(stages.has(MAIN)).toEqual(false);
    });
  });

  describe('step 2 — populate main (SINGLE_ELIMINATION)', () => {
    it('preserves qualifying structure and positions all MAIN entries with qualifier spots reserved', () => {
      const { eventId, drawId, mainIds } = setupQualifyingFirstDraw();

      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: SINGLE_ELIMINATION,
        drawSize: 32,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        seedsCount: 8,
        automated: true,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = result;

      // Should have exactly 2 structures (MAIN + the existing QUALIFYING), not 3
      expect(drawDefinition.structures.length).toEqual(2);
      // Should have exactly 1 link, not 2
      expect(drawDefinition.links.length).toEqual(1);

      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      const qualStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);

      // MAIN is now populated
      expect(mainStructure.matchUps.length).toBeGreaterThan(0);
      expect(mainStructure.positionAssignments.length).toEqual(32);

      const positioned = mainStructure.positionAssignments.filter((pa: any) => pa.participantId);
      const qualifierSpots = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
      const byes = mainStructure.positionAssignments.filter((pa: any) => pa.bye);

      // 28 entries + 3 qualifier spots + 1 bye = 32
      expect(positioned.length).toEqual(28);
      expect(qualifierSpots.length).toEqual(3);
      expect(byes.length).toEqual(1);

      // All MAIN entries are in the positioned set
      for (const pid of mainIds) {
        expect(positioned.some((pa: any) => pa.participantId === pid)).toEqual(true);
      }

      // Qualifying structure is preserved with its matchUps and positionAssignments
      expect(qualStructure.matchUps.length).toBeGreaterThan(0);
      expect(qualStructure.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(12);
    });

    it('preserves qualifying structure when populate main is saved via addDrawDefinition', () => {
      const { eventId, drawId } = setupQualifyingFirstDraw();
      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: SINGLE_ELIMINATION,
        drawSize: 32,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        seedsCount: 8,
        automated: true,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition, allowReplacement: true });

      // Round-trip through storage
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      expect(drawDefinition.structures.length).toEqual(2);
      expect(drawDefinition.links.length).toEqual(1);

      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      expect(mainStructure.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(28);
      expect(mainStructure.positionAssignments.filter((pa: any) => pa.qualifier).length).toEqual(3);
    });
  });

  describe('step 2 — populate main (ROUND_ROBIN)', () => {
    it('populates main with round robin, preserves qualifying, reserves qualifier spots', () => {
      const { eventId, drawId, mainIds } = setupQualifyingFirstDraw({
        mainCount: 13,
        qualCount: 8,
        qualifiersCount: 3,
        qualifyingDrawSize: 8,
      });

      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      // 13 entries + 3 qualifier spots = 16, RR of 16 → 4 groups of 4
      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: ROUND_ROBIN,
        drawSize: 16,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        automated: true,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = result;
      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      const qualStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);

      // RR main has a container + child structures; check positions via child structures
      const childStructures = mainStructure.structures ?? [];
      const allPositions = childStructures.flatMap((s: any) => s.positionAssignments ?? []);
      const positioned = allPositions.filter((pa: any) => pa.participantId);
      const qualifierSpots = allPositions.filter((pa: any) => pa.qualifier);

      expect(positioned.length).toEqual(13);
      expect(qualifierSpots.length).toEqual(3);
      for (const pid of mainIds) {
        expect(positioned.some((pa: any) => pa.participantId === pid)).toEqual(true);
      }

      // Qualifying structure preserved
      expect(qualStructure.matchUps.length).toBeGreaterThan(0);
    });
  });

  describe('step 2 — populate main (SWISS)', () => {
    it('populates Swiss main with positionAssignments and reserves qualifier spots', () => {
      const { eventId, drawId } = setupQualifyingFirstDraw();

      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: SWISS,
        drawSize: 32,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        automated: false,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = result;
      expect(drawDefinition.drawType).toEqual(SWISS);
      expect(drawDefinition.structures.length).toEqual(2);
      expect(drawDefinition.links.length).toEqual(1);

      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      const qualStructure = drawDefinition.structures.find((s: any) => s.stage === QUALIFYING);

      // Swiss has positionAssignments of drawSize, 3 marked as qualifier
      expect(mainStructure.positionAssignments.length).toEqual(32);
      expect(mainStructure.positionAssignments.filter((pa: any) => pa.qualifier).length).toEqual(3);

      // Qualifying structure preserved
      expect(qualStructure.matchUps.length).toBeGreaterThan(0);
      expect(qualStructure.positionAssignments.filter((pa: any) => pa.participantId).length).toEqual(12);
    });
  });

  describe('step 2 — populate main (LUCKY_DRAW)', () => {
    it('populates lucky draw main with all entries positioned and qualifier spots reserved', () => {
      const { eventId, drawId, mainIds } = setupQualifyingFirstDraw({
        mainCount: 27,
        qualCount: 12,
        qualifiersCount: 3,
        qualifyingDrawSize: 12,
      });

      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      // 27 entries + 3 qualifier spots = 30 (lucky draw allows non-power-of-2)
      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: LUCKY_DRAW,
        drawSize: 30,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        automated: true,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = result;
      expect(drawDefinition.drawType).toEqual(LUCKY_DRAW);
      expect(drawDefinition.structures.length).toEqual(2);

      const mainStructure = drawDefinition.structures.find((s: any) => s.stage === MAIN);
      const positioned = mainStructure.positionAssignments.filter((pa: any) => pa.participantId);
      const qualifierSpots = mainStructure.positionAssignments.filter((pa: any) => pa.qualifier);
      const byes = mainStructure.positionAssignments.filter((pa: any) => pa.bye);

      expect(mainStructure.positionAssignments.length).toEqual(30);
      expect(positioned.length).toEqual(27);
      expect(qualifierSpots.length).toEqual(3);
      expect(byes.length).toEqual(0);
      for (const pid of mainIds) {
        expect(positioned.some((pa: any) => pa.participantId === pid)).toEqual(true);
      }
    });
  });

  describe('drawType preservation', () => {
    it('populate main does not overwrite existing qualifying link source.structureId', () => {
      const { eventId, drawId } = setupQualifyingFirstDraw();
      const existingLink = tournamentEngine.getEvent({ drawId }).drawDefinition.links[0];
      const originalQualStructureId = existingLink.source.structureId;

      const mainDrawEntries = tournamentEngine
        .getEvent({ eventId })
        .event.entries.filter((e: any) => e.entryStage === MAIN && e.entryStatus === DIRECT_ACCEPTANCE);

      const result = tournamentEngine.generateDrawDefinition({
        drawEntries: mainDrawEntries,
        drawType: SINGLE_ELIMINATION,
        drawSize: 32,
        qualifyingPlaceholder: true,
        qualifiersCount: 3,
        automated: true,
        ignoreStageSpace: true,
        eventId,
        drawId,
      });
      expect(result.success).toEqual(true);

      const { drawDefinition } = result;
      expect(drawDefinition.links.length).toEqual(1);
      expect(drawDefinition.links[0].source.structureId).toEqual(originalQualStructureId);
    });
  });
});
