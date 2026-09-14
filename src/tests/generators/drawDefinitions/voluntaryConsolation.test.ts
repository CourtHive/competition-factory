/**
 * Voluntary consolation generation test suite.
 * Tests the full flow: generate SE main draw → complete matchUps → add VC entries → generate VC structure.
 * Each draw type scenario validates the expected structure shape and participant placement.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import {
  SINGLE_ELIMINATION,
  ROUND_ROBIN,
  LUCKY_DRAW,
  AD_HOC,
  VOLUNTARY_CONSOLATION,
} from '@Constants/drawDefinitionConstants';

const DRAW_SIZE = 32;
const DRAW_ID = 'mainDraw';
const EVENT_ID = 'event1';
const RATING_TYPE = 'WTN';

function setupCompletedMainDraw() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', participantsCount: DRAW_SIZE, scaleAllParticipants: true },
    eventProfiles: [
      {
        eventId: EVENT_ID,
        drawProfiles: [
          {
            drawId: DRAW_ID,
            drawSize: DRAW_SIZE,
            drawType: SINGLE_ELIMINATION,
            category: { ratingType: RATING_TYPE, ratingMin: 10, ratingMax: 20 },
          },
        ],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toBe(DRAW_SIZE - 1);
}

function getEligibleParticipants() {
  const result = tournamentEngine.getEligibleVoluntaryConsolationParticipants({ drawId: DRAW_ID });
  expect(result.eligibleParticipants.length).toBeGreaterThan(0);
  return result.eligibleParticipants;
}

function addVcEntries(participantIds: string[]) {
  let result: any = tournamentEngine.addDrawEntries({
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: VOLUNTARY_CONSOLATION,
    ignoreStageSpace: true,
    participantIds,
    eventId: EVENT_ID,
    drawId: DRAW_ID,
  });
  expect(result.success).toBe(true);
}

describe('Voluntary Consolation Generation', () => {
  describe('Single Elimination consolation', () => {
    it('generates SE consolation with participants placed and byes', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 10).map((p) => p.participantId);
      addVcEntries(selectedIds);

      let result: any = tournamentEngine.generateVoluntaryConsolation({
        drawType: SINGLE_ELIMINATION,
        structureName: 'Consolation',
        automated: true,
        drawId: DRAW_ID,
      });

      expect(result.success).toBe(true);
      expect(result.structures.length).toBeGreaterThan(0);

      const vcStructure = result.structures[0];
      expect(vcStructure.stage).toBe(VOLUNTARY_CONSOLATION);

      const assignments = vcStructure.positionAssignments || [];
      // Draw size should be nextPowerOf2(10) = 16
      expect(assignments.length).toBe(16);

      const participantAssignments = assignments.filter((a) => a.participantId);
      const byeAssignments = assignments.filter((a) => a.bye);
      expect(participantAssignments.length).toBe(10);
      expect(byeAssignments.length).toBe(6);

      expect(vcStructure.matchUps?.length).toBeGreaterThan(0);
    });
  });

  describe('Lucky Draw consolation', () => {
    it('generates Lucky Draw consolation with participants placed', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 10).map((p) => p.participantId);
      addVcEntries(selectedIds);

      let result: any = tournamentEngine.generateVoluntaryConsolation({
        drawType: LUCKY_DRAW,
        structureName: 'Consolation',
        automated: true,
        drawId: DRAW_ID,
      });

      expect(result.success).toBe(true);
      expect(result.structures.length).toBeGreaterThan(0);

      const vcStructure = result.structures[0];
      const assignments = vcStructure.positionAssignments || [];
      // Lucky draw uses exact entry count (even number), not nextPowerOf2
      expect(assignments.length).toBe(10);

      const participantAssignments = assignments.filter((a) => a.participantId);
      expect(participantAssignments.length).toBe(10);

      expect(vcStructure.matchUps?.length).toBeGreaterThan(0);
    });
  });

  describe('Round Robin consolation', () => {
    it('generates RR consolation structure with correct group count and matchUps', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 12).map((p) => p.participantId);
      addVcEntries(selectedIds);

      let result: any = tournamentEngine.generateVoluntaryConsolation({
        structureOptions: { groupSize: 4 },
        structureName: 'Consolation',
        drawType: ROUND_ROBIN,
        drawId: DRAW_ID,
      });

      expect(result.success).toBe(true);
      expect(result.structures).toBeDefined();

      const container = result.structures.find((s) => s.structures?.length);
      expect(container).toBeDefined();
      expect(container.stage).toBe(VOLUNTARY_CONSOLATION);
      // 12 players / groupSize 4 = 3 groups
      expect(container.structures.length).toBe(3);
      for (const group of container.structures) {
        expect(group.matchUps?.length).toBeGreaterThan(0);
      }
    });

    it('generates RR consolation with automated positioning places all participants', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 12).map((p) => p.participantId);
      addVcEntries(selectedIds);

      let result: any = tournamentEngine.generateVoluntaryConsolation({
        structureOptions: { groupSize: 4 },
        structureName: 'Consolation',
        drawType: ROUND_ROBIN,
        automated: true,
        drawId: DRAW_ID,
      });

      expect(result.success).toBe(true);
      const container = result.structures.find((s) => s.structures?.length);
      expect(container).toBeDefined();

      let totalPlaced = 0;
      for (const group of container.structures) {
        const filled = (group.positionAssignments || []).filter((a) => a.participantId);
        totalPlaced += filled.length;
      }
      expect(totalPlaced).toBe(12);
    });
  });

  describe('Ad Hoc consolation', () => {
    it('generates empty Ad Hoc consolation structure (rounds added later via modal)', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 10).map((p) => p.participantId);
      addVcEntries(selectedIds);

      let result: any = tournamentEngine.generateVoluntaryConsolation({
        drawType: AD_HOC,
        structureName: 'Consolation',
        drawId: DRAW_ID,
        // No automated: true — ad hoc rounds are generated separately via drawMatic/addAdHocRound
      });

      expect(result.success).toBe(true);
      expect(result.structures).toBeDefined();
      expect(result.structures.length).toBeGreaterThan(0);

      const vcStructure = result.structures[0];
      expect(vcStructure.stage).toBe(VOLUNTARY_CONSOLATION);
      // Ad hoc structures start empty — matchUps are added via the generate round flow
      expect(vcStructure.matchUps?.length || 0).toBe(0);
    });
  });

  describe('Entry cleanup', () => {
    it('removeStageEntries purges VC entries without affecting MAIN entries', () => {
      setupCompletedMainDraw();
      const eligible = getEligibleParticipants();
      const selectedIds = eligible.slice(0, 5).map((p) => p.participantId);
      addVcEntries(selectedIds);

      const { drawDefinition: before } = tournamentEngine.getEvent({ drawId: DRAW_ID });
      const vcEntriesBefore = before.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);
      const mainEntriesBefore = before.entries.filter((e) => !e.entryStage || e.entryStage === 'MAIN');
      expect(vcEntriesBefore.length).toBe(5);
      expect(mainEntriesBefore.length).toBe(DRAW_SIZE);

      let result: any = tournamentEngine.removeStageEntries({
        entryStage: VOLUNTARY_CONSOLATION,
        drawId: DRAW_ID,
      });
      expect(result.success).toBe(true);

      const { drawDefinition: after } = tournamentEngine.getEvent({ drawId: DRAW_ID });
      const vcEntriesAfter = after.entries.filter((e) => e.entryStage === VOLUNTARY_CONSOLATION);
      const mainEntriesAfter = after.entries.filter((e) => !e.entryStage || e.entryStage === 'MAIN');
      expect(vcEntriesAfter.length).toBe(0);
      expect(mainEntriesAfter.length).toBe(DRAW_SIZE);
    });
  });
});
