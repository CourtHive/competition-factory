import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { RANKING, SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

/**
 * A draw generated before its entries: "shell now, draw later" (CA, 2026-10-09: "we need a way to generate
 * entire draw structures irregardless of the number of entries"). The whole structure, main and qualifying,
 * is generated with nobody placed; entries are added as they arrive, and the positioning places everyone.
 *
 * CA, 2026-10-09: "the slots for qualifiers shouldn't be reserved in advance at all, those qualifying
 * placeholders or the qualifiers themselves get placed when the draw positioning is generated".
 */
const QUALIFIERS = 4;
const SEEDING_SCALE = 'SHELL_SEEDING';
const drawSizeOf = (drawType: string) => (drawType === FEED_IN ? 24 : 32);

function assignmentsOf(structure: any) {
  return structure.structures
    ? structure.structures.flatMap((group: any) => group.positionAssignments)
    : structure.positionAssignments;
}

function counts(drawId: string, stage: string) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures.find((s: any) => s.stage === stage);
  const assignments = assignmentsOf(structure);
  return {
    positions: assignments.length,
    participants: assignments.filter((pa: any) => pa.participantId).length,
    byes: assignments.filter((pa: any) => pa.bye).length,
    qualifiers: assignments.filter((pa: any) => pa.qualifier).length,
  };
}

function generateShell({ drawType, withQualifying = true }: { drawType: string; withQualifying?: boolean }) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 60 }, setState: true });
  const eventId = tournamentEngine.addEvent({ event: { eventName: 'Shell', eventType: SINGLES } }).event.eventId;
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  const result: any = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: withQualifying
      ? [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: QUALIFIERS }] }]
      : undefined,
    drawSize: drawSizeOf(drawType),
    drawEntries: [],
    automated: true,
    drawType,
    eventId,
  });
  expect(result.success).toEqual(true);
  tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
  return { eventId, drawId: result.drawDefinition.drawId, participantIds, drawDefinition: result.drawDefinition };
}

function enter({ eventId, drawId, participantIds, entryStage = MAIN }) {
  expect(tournamentEngine.addEventEntries({ participantIds, entryStage, eventId }).success).toEqual(true);
  expect(tournamentEngine.addDrawEntries({ participantIds, entryStage, drawId, eventId }).success).toEqual(true);
}

const structureIdOf = (drawId: string, stage: string) =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s: any) => s.stage === stage).structureId;

describe('a draw generated before its entries', () => {
  it.each([SINGLE_ELIMINATION, FEED_IN, ROUND_ROBIN])(
    '%s main and qualifying are generated with nobody placed',
    (drawType) => {
      const { drawId } = generateShell({ drawType });
      const nobody = { participants: 0, byes: 0, qualifiers: 0 };
      expect(counts(drawId, MAIN)).toEqual({ positions: drawSizeOf(drawType), ...nobody });
      expect(counts(drawId, QUALIFYING)).toEqual({ positions: 16, ...nobody });
    },
  );

  it.each([SINGLE_ELIMINATION, FEED_IN, ROUND_ROBIN])(
    '%s: entries arriving later are placed with the qualifiers and BYEs when the draw is positioned',
    (drawType) => {
      const { eventId, drawId, participantIds } = generateShell({ drawType });
      enter({ eventId, drawId, participantIds: participantIds.slice(0, 20) });
      enter({ eventId, drawId, participantIds: participantIds.slice(20, 33), entryStage: QUALIFYING });

      for (const stage of [QUALIFYING, MAIN]) {
        const result = tournamentEngine.automatedPositioning({ drawId, structureId: structureIdOf(drawId, stage) });
        expect(result.success, stage).toEqual(true);
      }

      const drawSize = drawSizeOf(drawType);
      expect(counts(drawId, MAIN)).toEqual({
        byes: drawSize - 20 - QUALIFIERS,
        qualifiers: QUALIFIERS,
        positions: drawSize,
        participants: 20,
      });
      expect(counts(drawId, QUALIFYING)).toEqual({ positions: 16, participants: 13, byes: 3, qualifiers: 0 });
      expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);
    },
  );

  it('a main that only qualifiers will fill gets its qualifier seats and BYEs when positioned', () => {
    const { drawId } = generateShell({ drawType: SINGLE_ELIMINATION });
    const result = tournamentEngine.automatedPositioning({ drawId, structureId: structureIdOf(drawId, MAIN) });
    expect(result.success).toEqual(true);
    expect(counts(drawId, MAIN)).toEqual({ positions: 32, participants: 0, byes: 28, qualifiers: QUALIFIERS });
  });

  it('CONTROL: a draw generated with its entries is still positioned when it is generated', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 20 }, setState: true });
    const eventId = tournamentEngine.addEvent({ event: { eventName: 'Entered' } }).event.eventId;
    const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
    tournamentEngine.addEventEntries({ participantIds: participantIds.slice(0, 10), eventId });
    const result: any = tournamentEngine.generateDrawDefinition({ drawSize: 32, automated: true, eventId });
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(counts(result.drawDefinition.drawId, MAIN)).toEqual({
      positions: 32,
      participants: 10,
      byes: 22,
      qualifiers: 0,
    });
  });
});

describe('a draw generated before its entries is seeded when it is positioned', () => {
  function seededShell(seedsCount: number, enforcePolicyLimits?: boolean) {
    const { eventId, drawId, participantIds } = generateShell({ drawType: SINGLE_ELIMINATION, withQualifying: false });
    const entered = participantIds.slice(0, 20);
    enter({ eventId, drawId, participantIds: entered });
    // the first 16 entries carry a seeding value; 1 is the top seed
    const scaleItemsWithParticipantIds = entered.slice(0, 16).map((participantId: string, index: number) => ({
      scaleItems: [{ scaleType: SEEDING, eventType: SINGLES, scaleName: SEEDING_SCALE, scaleValue: index + 1 }],
      participantId,
    }));
    expect(tournamentEngine.setParticipantScaleItems({ scaleItemsWithParticipantIds }).success).toEqual(true);

    const structureId = structureIdOf(drawId, MAIN);
    const result = tournamentEngine.automatedPositioning({
      seedingScaleName: SEEDING_SCALE,
      enforcePolicyLimits,
      structureId,
      seedsCount,
      drawId,
    });
    expect(result.success).toEqual(true);
    const { seedAssignments } = tournamentEngine.getStructureSeedAssignments({ drawId, structureId });
    const seeded = seedAssignments.filter((assignment: any) => assignment.participantId);
    return { drawId, entered, seeded };
  }

  it('the seeds are the best-seeded entries present, and they are placed', () => {
    const { drawId, entered, seeded } = seededShell(4);
    expect(seeded.map((s: any) => s.seedNumber)).toEqual([1, 2, 3, 4]);
    expect(seeded.map((s: any) => s.participantId)).toEqual(entered.slice(0, 4));
    const main = tournamentEngine.getEvent({ drawId }).drawDefinition.structures.find((s: any) => s.stage === MAIN);
    const placed = main.positionAssignments.map((pa: any) => pa.participantId);
    expect(seeded.every((s: any) => placed.includes(s.participantId))).toEqual(true);
    expect(counts(drawId, MAIN)).toEqual({ positions: 32, participants: 20, byes: 12, qualifiers: 0 });
  });

  it('the seeding policy limits the seeds by the entries present when it is positioned', () => {
    const { drawId, seeded } = seededShell(16);
    // generated with no entries, the policy would have allowed none; positioned with 20, it allows what 20 allow
    const { seedsCount } = tournamentEngine.getSeedsCount({ participantsCount: 20, drawSize: 32, drawId });
    expect(seedsCount).toBeLessThan(16);
    expect(seeded.length).toEqual(seedsCount);

    expect(seededShell(16, false).seeded.length).toEqual(16);
  });

  it('a positioning computed apart is replayed with its seeds', () => {
    const replay = (withSeeds: boolean) => {
      const { eventId, drawId, participantIds } = generateShell({
        drawType: SINGLE_ELIMINATION,
        withQualifying: false,
      });
      enter({ eventId, drawId, participantIds: participantIds.slice(0, 20) });
      const scaleItemsWithParticipantIds = participantIds.slice(0, 8).map((participantId: string, index: number) => ({
        scaleItems: [{ scaleType: SEEDING, eventType: SINGLES, scaleName: SEEDING_SCALE, scaleValue: index + 1 }],
        participantId,
      }));
      tournamentEngine.setParticipantScaleItems({ scaleItemsWithParticipantIds });
      const structureId = structureIdOf(drawId, MAIN);
      // how TMX positions: computed without applying, then sent as one mutation the server and client both replay
      const computed: any = tournamentEngine.automatedPositioning({
        seedingScaleName: SEEDING_SCALE,
        applyPositioning: false,
        seedsCount: 4,
        structureId,
        drawId,
      });
      expect(computed.seedAssignments.filter((s: any) => s.participantId).length).toEqual(4);
      const { positionAssignments, seedAssignments } = computed;
      const structurePositionAssignments = [
        { structureId, positionAssignments, ...(withSeeds ? { seedAssignments } : {}) },
      ];
      const result = tournamentEngine.setPositionAssignments({ structurePositionAssignments, structureId, drawId });
      expect(result.success).toEqual(true);
      expect(counts(drawId, MAIN).participants).toEqual(20);
      const seeded = tournamentEngine
        .getStructureSeedAssignments({ drawId, structureId })
        .seedAssignments.filter((s: any) => s.participantId);
      return { seeded: seeded.map((s: any) => s.participantId), best: participantIds.slice(0, 4) };
    };

    const { seeded, best } = replay(true);
    expect(seeded).toEqual(best);
    // CONTROL: without them, the replayed draw has positions and no seeds
    expect(replay(false).seeded).toEqual([]);
  });

  it('with no seeding, it seeds by ranking when asked', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 20 }, setState: true });
    const category = { categoryName: 'U18' };
    const event = { eventName: 'Ranked', eventType: SINGLES, category };
    const eventId = tournamentEngine.addEvent({ event }).event.eventId;
    const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
    const result: any = tournamentEngine.generateDrawDefinition({ drawEntries: [], drawSize: 16, eventId });
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    const drawId = result.drawDefinition.drawId;
    enter({ eventId, drawId, participantIds: participantIds.slice(0, 12) });
    // ranked 1..4 in reverse entry order
    const ranked = participantIds.slice(0, 4).reverse();
    const scaleItemsWithParticipantIds = ranked.map((participantId: string, index: number) => ({
      scaleItems: [{ scaleType: RANKING, eventType: SINGLES, scaleName: 'U18', scaleValue: index + 1 }],
      participantId,
    }));
    expect(tournamentEngine.setParticipantScaleItems({ scaleItemsWithParticipantIds }).success).toEqual(true);

    const structureId = structureIdOf(drawId, MAIN);
    const positioned = tournamentEngine.automatedPositioning({
      seedByRanking: true,
      seedsCount: 4,
      structureId,
      drawId,
    });
    expect(positioned.success).toEqual(true);
    const { seedAssignments } = tournamentEngine.getStructureSeedAssignments({ drawId, structureId });
    expect(seedAssignments.filter((s: any) => s.participantId).map((s: any) => s.participantId)).toEqual(ranked);
  });

  it('seeds chosen when the draw was generated are kept', () => {
    mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 20 }, setState: true });
    const eventId = tournamentEngine.addEvent({ event: { eventName: 'Manual', eventType: SINGLES } }).event.eventId;
    const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
    tournamentEngine.addEventEntries({ participantIds, eventId });
    // Manual creation with its entries: the 2 seeds are chosen now, nobody is placed
    const seededParticipants = participantIds.slice(10, 12).map((participantId: string, index: number) => ({
      seedNumber: index + 1,
      participantId,
    }));
    const result: any = tournamentEngine.generateDrawDefinition({
      seededParticipants,
      automated: false,
      seedsCount: 2,
      drawSize: 32,
      eventId,
    });
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    const drawId = result.drawDefinition.drawId;
    const structureId = structureIdOf(drawId, MAIN);
    expect(counts(drawId, MAIN).participants).toEqual(0);

    const positioned = tournamentEngine.automatedPositioning({ seedsCount: 8, structureId, drawId });
    expect(positioned.success).toEqual(true);
    const { seedAssignments } = tournamentEngine.getStructureSeedAssignments({ drawId, structureId });
    expect(seedAssignments.filter((s: any) => s.participantId).map((s: any) => s.participantId)).toEqual(
      participantIds.slice(10, 12),
    );
  });

  it('a structure someone is already placed in is not seeded', () => {
    const { eventId, drawId, participantIds } = generateShell({ drawType: SINGLE_ELIMINATION, withQualifying: false });
    enter({ eventId, drawId, participantIds: participantIds.slice(0, 20) });
    const structureId = structureIdOf(drawId, MAIN);
    const participantId = participantIds[5];
    expect(
      tournamentEngine.assignDrawPosition({ drawPosition: 1, participantId, structureId, drawId }).success,
    ).toEqual(true);
    const result = tournamentEngine.automatedPositioning({
      seedingScaleName: SEEDING_SCALE,
      seedsCount: 4,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    const { seedAssignments } = tournamentEngine.getStructureSeedAssignments({ drawId, structureId });
    expect(seedAssignments.filter((assignment: any) => assignment.participantId)).toEqual([]);
    expect(counts(drawId, MAIN).participants).toEqual(20);
  });
});
