import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { MISSING_STRUCTURE_ID, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SINGLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

function seedWithQualifying() {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        drawType: SINGLE_ELIMINATION,
        qualifiersCount: 4,
        qualifyingProfiles: [
          { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 16, qualifyingPositions: 4 }] },
        ],
      },
    ],
    participantsProfile: { nonRandom: 1 },
    setState: true,
  });
  return drawId;
}

describe('getStructureData', () => {
  it('returns one structure, identical to that structure from getDrawData', () => {
    const drawId = seedWithQualifying();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const full: any = tournamentEngine.getDrawData({ drawDefinition });
    const target = full.structures.find((s: any) => s.stage === 'MAIN');

    const result: any = tournamentEngine.getStructureData({ drawDefinition, structureId: target.structureId });
    expect(result.success).toEqual(true);
    // Identical content — narrowing must not change what a structure looks like.
    expect(JSON.stringify(result.structure)).toEqual(JSON.stringify(target));
    expect(result.drawInfo?.drawId).toEqual(drawId);
  });

  it('narrows the PAYLOAD — one structure instead of all of them', () => {
    // Deliberately NOT a claim about compute. Measured across SINGLE_ELIMINATION, ROUND_ROBIN, COMPASS,
    // CURTIS_CONSOLATION, FEED_IN_CHAMPIONSHIP and a qualifying-fed draw, every draw is a SINGLE
    // structure group, so there is no independent group to skip. The value is response size and a
    // per-structure cache entry — cache granularity is invalidation granularity.
    const drawId = seedWithQualifying();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const full: any = tournamentEngine.getDrawData({ drawDefinition });
    expect(full.structures.length).toBeGreaterThan(1);
    const mainId = full.structures.find((s: any) => s.stage === 'MAIN').structureId;

    const one: any = tournamentEngine.getStructureData({ drawDefinition, structureId: mainId });
    expect(one.structure.structureId).toEqual(mainId);
    expect(JSON.stringify(one.structure).length).toBeLessThan(JSON.stringify(full.structures).length);
  });

  it('preserves sourceStructuresComplete — it depends on siblings, so the draw is assembled whole', () => {
    // Within-group values read completedStructures[sourceId]; skipping a sibling in the same group
    // would make a complete source read as incomplete.
    const drawId = seedWithQualifying();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const full: any = tournamentEngine.getDrawData({ drawDefinition });
    for (const s of full.structures) {
      const one: any = tournamentEngine.getStructureData({ drawDefinition, structureId: s.structureId });
      expect(one.structure?.sourceStructuresComplete).toEqual(s.sourceStructuresComplete);
    }
  });

  it('round robin — nested structures resolve to the containing structure', () => {
    const {
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN }],
      participantsProfile: { nonRandom: 1 },
      setState: true,
    });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const full: any = tournamentEngine.getDrawData({ drawDefinition });

    const result: any = tournamentEngine.getStructureData({
      drawDefinition,
      structureId: full.structures[0].structureId,
    });
    expect(result.success).toEqual(true);
    expect(JSON.stringify(result.structure)).toEqual(JSON.stringify(full.structures[0]));
  });

  it('errors rather than guessing', () => {
    const drawId = seedWithQualifying();
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    expect(tournamentEngine.getStructureData({ drawDefinition }).error).toEqual(MISSING_STRUCTURE_ID);
    expect(tournamentEngine.getStructureData({ drawDefinition, structureId: 'nope' }).error).toEqual(
      STRUCTURE_NOT_FOUND,
    );
  });
});
