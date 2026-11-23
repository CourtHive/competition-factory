import { generateAndPopulatePlayoffStructures } from '@Generators/drawDefinitions/generateAndPopulatePlayoffStructures';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * A playoff name with no abbreviation is a complete naming entry (2026-11-08).
 *
 * `PlayoffAttributes` / `NamingEntry` declared `abbreviation` required while the generators read it with `?.`, so every
 * typed caller sending a name alone — the TMX Add playoffs dialog and the topology's playoff chips — had to cast.
 *
 * The typed generator is called directly and WITHOUT a cast: the engine wrapper takes untyped params, so a call through
 * `tournamentEngine` never meets `NamingEntry` and could not pin it (measured: with `abbreviation` required again, a
 * wrapper-only test still type-checked). This one does not.
 */
it('names a generated playoff from a name alone, with no abbreviation', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ setState: true, drawProfiles: [{ drawSize: 16 }] });
  const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;

  const { tournamentRecord } = tournamentEngine.getTournament();
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  let result: any = generateAndPopulatePlayoffStructures({
    playoffAttributes: { '0-2': { name: 'Playoff 5-8' } },
    roundProfiles: [{ 2: 1 }],
    tournamentRecord,
    drawDefinition,
    structureId,
  });
  expect(result.error).toBeUndefined();
  const [structure] = result.structures;
  expect(structure.structureName).toEqual('Playoff 5-8');
  expect(structure.structureAbbreviation).toBeUndefined();

  result = tournamentEngine.attachPlayoffStructures({
    matchUpModifications: result.matchUpModifications,
    structures: result.structures,
    links: result.links,
    drawId,
  });
  expect(result.success).toEqual(true);
});
