/**
 * Tests for reproducing COMPASS-like draws using withPlayoffs (including
 * recursive roundPlayoffs) instead of the built-in drawType: COMPASS.
 *
 * COMPASS topology (32 draw):
 *   East (MAIN, 32) ──R1 losers──▶ West (16) ──R1 losers──▶ South (8) ──R1 losers──▶ Southeast (4)
 *                    ──R2 losers──▶ North (8) ──R1 losers──▶ Northwest (4)
 *                    ──R3 losers──▶ Northeast (4)
 *   West (16)        ──R2 losers──▶ Southwest (4)
 *
 * 8 structures, 7 LOSER links, 72 matchUps total.
 */
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { SINGLE_ELIMINATION, COMPASS, PLAY_OFF, LOSER, MAIN } from '@Constants/drawDefinitionConstants';

describe('COMPASS via withPlayoffs — exploration', () => {
  it('reference: native COMPASS produces 8 structures, 7 links, 72 matchUps', () => {
    const drawSize = 32;
    const eventId = 'compassRef';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { eventId, eventName: 'COMPASS Reference', participantsProfile: { participantsCount: drawSize } },
      ],
      setState: true,
    });

    const result = tournamentEngine.generateDrawDefinition({
      drawType: COMPASS,
      drawSize,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = result;
    expect(drawDefinition.structures.length).toEqual(8);
    expect(drawDefinition.links.length).toEqual(7);

    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(72);

    const structureNames = drawDefinition.structures.map((s) => s.structureName).sort();
    expect(structureNames).toEqual([
      'East',
      'North',
      'Northeast',
      'Northwest',
      'South',
      'Southeast',
      'Southwest',
      'West',
    ]);
  });

  it('withPlayoffs creates first-level playoff structures from MAIN', () => {
    const drawSize = 32;
    const eventId = 'firstLevel';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, eventName: 'First Level', participantsProfile: { participantsCount: drawSize } }],
      setState: true,
    });

    const result = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      drawSize,
      eventId,
      withPlayoffs: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
        playoffAttributes: {
          '0-1': { name: 'West', abbreviation: 'W' },
          '0-2': { name: 'North', abbreviation: 'N' },
          '0-3': { name: 'Northeast', abbreviation: 'NE' },
        },
      },
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = result;
    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toEqual(3);

    const west = drawDefinition.structures.find((s) => s.structureName === 'West');
    const north = drawDefinition.structures.find((s) => s.structureName === 'North');
    const northeast = drawDefinition.structures.find((s) => s.structureName === 'Northeast');

    // R1 losers=16 players→15 matchups, R2 losers=8→7, R3 losers=4→3
    expect(west.matchUps.length).toEqual(15);
    expect(north.matchUps.length).toEqual(7);
    expect(northeast.matchUps.length).toEqual(3);

    expect(drawDefinition.links.filter((l) => l.linkType === LOSER).length).toEqual(3);

    // First level: 31 + 15 + 7 + 3 = 56 matchUps (vs COMPASS's 72)
    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(56);
  });

  it('chained addPlayoffStructures can reproduce full COMPASS topology', () => {
    const drawSize = 32;
    const eventId = 'fullCompass';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, eventName: 'Full COMPASS', participantsProfile: { participantsCount: drawSize } }],
      setState: true,
    });

    // Step 1: MAIN + first-level playoffs (East → West, North, Northeast)
    const genResult = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      drawSize,
      eventId,
      withPlayoffs: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
        playoffAttributes: {
          '0-1': { name: 'West', abbreviation: 'W' },
          '0-2': { name: 'North', abbreviation: 'N' },
          '0-3': { name: 'Northeast', abbreviation: 'NE' },
        },
      },
    });
    expect(genResult.success).toEqual(true);
    const { drawDefinition } = genResult;
    tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    const drawId = drawDefinition.drawId;

    // Step 2: Chain from West → South (R1 losers), Southwest (R2 losers)
    const west = drawDefinition.structures.find((s) => s.structureName === 'West');
    let chainResult = tournamentEngine.addPlayoffStructures({
      structureId: west.structureId,
      roundProfiles: [{ 1: 1 }, { 2: 1 }],
      playoffAttributes: {
        '0-1': { name: 'South', abbreviation: 'S' },
        '0-2': { name: 'Southwest', abbreviation: 'SW' },
      },
      drawId,
    });
    expect(chainResult.success).toEqual(true);

    // Step 3: Chain from North → Northwest (R1 losers)
    const north = drawDefinition.structures.find((s) => s.structureName === 'North');
    chainResult = tournamentEngine.addPlayoffStructures({
      structureId: north.structureId,
      roundProfiles: [{ 1: 1 }],
      playoffAttributes: {
        '0-1': { name: 'Northwest', abbreviation: 'NW' },
      },
      drawId,
    });
    expect(chainResult.success).toEqual(true);

    // Step 4: Chain from South → Southeast (R1 losers)
    const { drawDefinition: updatedDraw } = tournamentEngine.getEvent({ drawId });
    const south = updatedDraw.structures.find((s) => s.structureName === 'South');
    chainResult = tournamentEngine.addPlayoffStructures({
      structureId: south.structureId,
      roundProfiles: [{ 1: 1 }],
      playoffAttributes: {
        '0-1': { name: 'Southeast', abbreviation: 'SE' },
      },
      drawId,
    });
    expect(chainResult.success).toEqual(true);

    // Verify: should match COMPASS topology
    const { drawDefinition: finalDraw } = tournamentEngine.getEvent({ drawId });

    // 8 structures total
    expect(finalDraw.structures.length).toEqual(8);

    // 7 LOSER links
    const loserLinks = finalDraw.links.filter((l) => l.linkType === LOSER);
    expect(loserLinks.length).toEqual(7);

    // 72 total matchUps
    const totalMatchUps = finalDraw.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(72);

    // All 8 compass direction names present
    const structureNames = finalDraw.structures.map((s) => s.structureName).sort();
    expect(structureNames).toEqual([
      'Main', // MAIN structure (not 'East' since we didn't set playoffAttributes['0'])
      'North',
      'Northeast',
      'Northwest',
      'South',
      'Southeast',
      'Southwest',
      'West',
    ]);

    // Verify individual structure matchUp counts
    const byName = (name) => finalDraw.structures.find((s) => s.structureName === name);
    expect(byName('West').matchUps.length).toEqual(15); // 16-draw
    expect(byName('North').matchUps.length).toEqual(7); // 8-draw
    expect(byName('Northeast').matchUps.length).toEqual(3); // 4-draw
    expect(byName('South').matchUps.length).toEqual(7); // 8-draw
    expect(byName('Southwest').matchUps.length).toEqual(3); // 4-draw
    expect(byName('Northwest').matchUps.length).toEqual(3); // 4-draw
    expect(byName('Southeast').matchUps.length).toEqual(3); // 4-draw

    // Stage assignments
    expect(byName('West').stage).toEqual(PLAY_OFF);
    expect(byName('South').stage).toEqual(PLAY_OFF);
    expect(byName('Southeast').stage).toEqual(PLAY_OFF);
  });

  it('recursive withPlayoffs builds full COMPASS topology in one call', () => {
    const drawSize = 32;
    const eventId = 'recursiveCompass';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { eventId, eventName: 'Recursive COMPASS', participantsProfile: { participantsCount: drawSize } },
      ],
      setState: true,
    });

    const result = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      drawSize,
      eventId,
      withPlayoffs: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
        playoffAttributes: {
          '0-1': { name: 'West', abbreviation: 'W' },
          '0-2': { name: 'North', abbreviation: 'N' },
          '0-3': { name: 'Northeast', abbreviation: 'NE' },
        },
        roundPlayoffs: {
          1: {
            // West
            roundProfiles: [{ 1: 1 }, { 2: 1 }],
            playoffAttributes: {
              '0-1': { name: 'South', abbreviation: 'S' },
              '0-2': { name: 'Southwest', abbreviation: 'SW' },
            },
            roundPlayoffs: {
              1: {
                // South
                roundProfiles: [{ 1: 1 }],
                playoffAttributes: { '0-1': { name: 'Southeast', abbreviation: 'SE' } },
              },
            },
          },
          2: {
            // North
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: { '0-1': { name: 'Northwest', abbreviation: 'NW' } },
          },
        },
      },
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = result;

    // 8 structures total
    expect(drawDefinition.structures.length).toEqual(8);

    // 7 LOSER links
    const loserLinks = drawDefinition.links.filter((l) => l.linkType === LOSER);
    expect(loserLinks.length).toEqual(7);

    // 72 total matchUps
    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(72);

    // All 8 structure names present
    const structureNames = drawDefinition.structures.map((s) => s.structureName).sort();
    expect(structureNames).toEqual([
      'Main',
      'North',
      'Northeast',
      'Northwest',
      'South',
      'Southeast',
      'Southwest',
      'West',
    ]);

    // Verify individual structure matchUp counts
    const byName = (name) => drawDefinition.structures.find((s) => s.structureName === name);
    expect(byName('Main').matchUps.length).toEqual(31); // 32-draw
    expect(byName('West').matchUps.length).toEqual(15); // 16-draw
    expect(byName('North').matchUps.length).toEqual(7); // 8-draw
    expect(byName('Northeast').matchUps.length).toEqual(3); // 4-draw
    expect(byName('South').matchUps.length).toEqual(7); // 8-draw
    expect(byName('Southwest').matchUps.length).toEqual(3); // 4-draw
    expect(byName('Northwest').matchUps.length).toEqual(3); // 4-draw
    expect(byName('Southeast').matchUps.length).toEqual(3); // 4-draw
  });

  it('partial COMPASS (6 structures) — custom topology without Southwest/Southeast', () => {
    const drawSize = 32;
    const eventId = 'partialCompass';

    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        { eventId, eventName: 'Partial COMPASS', participantsProfile: { participantsCount: drawSize } },
      ],
      setState: true,
    });

    const result = tournamentEngine.generateDrawDefinition({
      drawType: SINGLE_ELIMINATION,
      drawSize,
      eventId,
      withPlayoffs: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
        playoffAttributes: {
          '0-1': { name: 'West', abbreviation: 'W' },
          '0-2': { name: 'North', abbreviation: 'N' },
          '0-3': { name: 'Northeast', abbreviation: 'NE' },
        },
        roundPlayoffs: {
          1: {
            // West → South only (no Southwest)
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: {
              '0-1': { name: 'South', abbreviation: 'S' },
            },
          },
          2: {
            // North → Northwest
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: { '0-1': { name: 'Northwest', abbreviation: 'NW' } },
          },
        },
      },
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = result;

    // 6 structures: Main, West, North, Northeast, South, Northwest
    expect(drawDefinition.structures.length).toEqual(6);

    // 5 LOSER links
    const loserLinks = drawDefinition.links.filter((l) => l.linkType === LOSER);
    expect(loserLinks.length).toEqual(5);

    const structureNames = drawDefinition.structures.map((s) => s.structureName).sort();
    expect(structureNames).toEqual(['Main', 'North', 'Northeast', 'Northwest', 'South', 'West']);

    // Total: 31 + 15 + 7 + 3 + 7 + 3 = 66
    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(66);
  });
});

describe('mocksEngine drawProfiles with recursive withPlayoffs', () => {
  const compassWithPlayoffs = {
    roundProfiles: [{ 1: 1 }, { 2: 1 }, { 3: 1 }],
    playoffAttributes: {
      '0-1': { name: 'West', abbreviation: 'W' },
      '0-2': { name: 'North', abbreviation: 'N' },
      '0-3': { name: 'Northeast', abbreviation: 'NE' },
    },
    roundPlayoffs: {
      1: {
        roundProfiles: [{ 1: 1 }, { 2: 1 }],
        playoffAttributes: {
          '0-1': { name: 'South', abbreviation: 'S' },
          '0-2': { name: 'Southwest', abbreviation: 'SW' },
        },
        roundPlayoffs: {
          1: {
            roundProfiles: [{ 1: 1 }],
            playoffAttributes: { '0-1': { name: 'Southeast', abbreviation: 'SE' } },
          },
        },
      },
      2: {
        roundProfiles: [{ 1: 1 }],
        playoffAttributes: { '0-1': { name: 'Northwest', abbreviation: 'NW' } },
      },
    },
  };

  it('recursive withPlayoffs works via top-level drawProfiles', () => {
    const result = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: SINGLE_ELIMINATION,
          drawSize: 32,
          withPlayoffs: compassWithPlayoffs,
        },
      ],
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = result;
    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId: result.drawIds[0] });

    // 8 structures, 7 LOSER links, 72 matchUps
    expect(drawDefinition.structures.length).toEqual(8);
    expect(drawDefinition.links.filter((l) => l.linkType === LOSER).length).toEqual(7);

    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(72);

    const structureNames = drawDefinition.structures.map((s) => s.structureName).sort();
    expect(structureNames).toEqual([
      'Main',
      'North',
      'Northeast',
      'Northwest',
      'South',
      'Southeast',
      'Southwest',
      'West',
    ]);
  });

  it('recursive withPlayoffs works via eventProfiles drawProfiles', () => {
    const result = mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          eventName: 'Compass Event',
          participantsProfile: { participantsCount: 32 },
          drawProfiles: [
            {
              drawType: SINGLE_ELIMINATION,
              drawSize: 32,
              withPlayoffs: compassWithPlayoffs,
            },
          ],
        },
      ],
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = result;
    tournamentEngine.setState(tournamentRecord);

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];

    expect(drawDefinition.structures.length).toEqual(8);
    expect(drawDefinition.links.filter((l) => l.linkType === LOSER).length).toEqual(7);

    const totalMatchUps = drawDefinition.structures.reduce((sum, s) => sum + (s.matchUps?.length || 0), 0);
    expect(totalMatchUps).toEqual(72);

    // Verify playoff structures are in PLAY_OFF stage
    const playoffStructures = drawDefinition.structures.filter((s) => s.stage === PLAY_OFF);
    expect(playoffStructures.length).toEqual(7);
    const mainStructures = drawDefinition.structures.filter((s) => s.stage === MAIN);
    expect(mainStructures.length).toEqual(1);
  });
});
