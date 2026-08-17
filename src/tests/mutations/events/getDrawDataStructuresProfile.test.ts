import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { PayloadProfileEnum } from '@Types/tournamentTypes';

function seed(drawProfile: any) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [drawProfile],
    participantsProfile: { nonRandom: 1 },
    setState: true,
  });
  return drawId;
}

function completeAll(drawId: string) {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-4 6-2',
    matchUpStatus: 'COMPLETED',
    winningSide: 1,
  });
  for (let pass = 0; pass < 12; pass++) {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const next = matchUps.filter(
      (m: any) => !m.winningSide && (m.sides ?? []).filter((s: any) => s?.participantId).length === 2,
    );
    if (!next.length) return;
    for (const m of next) tournamentEngine.setMatchUpStatus({ matchUpId: m.matchUpId, drawId, outcome });
  }
}

describe('getDrawData structuresProfile', () => {
  it('is ADDITIVE — omitting structuresProfile is byte-identical to passing FULL', () => {
    // ClubSpark runs the existing pattern at scale; default output must not move.
    const drawId = seed({ drawSize: 16, drawType: SINGLE_ELIMINATION });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const omitted: any = tournamentEngine.getDrawData({ drawDefinition });
    const explicit: any = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: PayloadProfileEnum.FULL });

    expect(JSON.stringify(omitted)).toEqual(JSON.stringify(explicit));
    expect(omitted.structures[0].roundMatchUps).toBeDefined();
  });

  it('rejects an unknown profile rather than silently returning the full payload', () => {
    const drawId = seed({ drawSize: 8, drawType: SINGLE_ELIMINATION });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const result: any = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: 'stubs' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.structures).toBeUndefined();
  });

  it('STUBS omits roundMatchUps and is dramatically smaller', () => {
    const drawId = seed({ drawSize: 32, drawType: SINGLE_ELIMINATION });
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });

    const full: any = tournamentEngine.getDrawData({ drawDefinition });
    const stubs: any = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: PayloadProfileEnum.STUBS });

    const stub = stubs.structures[0];
    expect(stub.roundMatchUps).toBeUndefined();
    expect(stub.seedAssignments).toBeUndefined();
    expect(stub.structureId).toEqual(full.structures[0].structureId);
    expect(stub.structureName).toEqual(full.structures[0].structureName);

    expect(JSON.stringify(stubs.structures).length * 10).toBeLessThan(JSON.stringify(full.structures).length);
  });

  it.each([
    ['single elimination', { drawSize: 16, drawType: SINGLE_ELIMINATION }],
    ['round robin (matchUps live in NESTED structures)', { drawSize: 16, drawType: ROUND_ROBIN }],
  ])('%s — structureCompleted matches FULL, untouched and completed', (_label, profile) => {
    let drawId = seed(profile);
    let drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    let full: any = tournamentEngine.getDrawData({ drawDefinition });
    let stubs: any = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: PayloadProfileEnum.STUBS });
    expect(stubs.structures[0].structureCompleted).toEqual(!!full.structures[0].structureCompleted);
    expect(stubs.structures[0].structureCompleted).toEqual(false);

    // completed — proves the assertion can change value rather than agreeing on a constant
    drawId = seed(profile);
    completeAll(drawId);
    drawDefinition = tournamentEngine.getEvent({ drawId }).drawDefinition;
    full = tournamentEngine.getDrawData({ drawDefinition });
    stubs = tournamentEngine.getDrawData({ drawDefinition, structuresProfile: PayloadProfileEnum.STUBS });
    expect(stubs.structures[0].structureCompleted).toEqual(!!full.structures[0].structureCompleted);
    expect(stubs.structures[0].structureCompleted).toEqual(true);
  });
});
