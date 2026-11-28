import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { defined } from '@Tests/helpers/defined';
import { getStructureData } from '@Query/drawDefinition/getStructureData';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, vi } from 'vitest';

// constants and types
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { PayloadProfileEnum } from '@Types/tournamentTypes';

// getDrawData handed each structure an empty participant list and no matchUps map or exit profiles, so every
// structure of a draw hydrated every tournament participant and mapped the whole draw again: eight times for a
// COMPASS draw (assessment 2026-10-16 H5). They are built once per draw now.

const calls = vi.hoisted(() => ({ hydrateParticipants: 0, getMatchUpsMap: 0, getExitProfiles: 0 }));

vi.mock('@Query/participants/hydrateParticipants', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    hydrateParticipants: (params) => {
      calls.hydrateParticipants += 1;
      return actual.hydrateParticipants(params);
    },
  };
});
vi.mock('@Query/matchUps/getMatchUpsMap', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getMatchUpsMap: (params) => {
      calls.getMatchUpsMap += 1;
      return actual.getMatchUpsMap(params);
    },
  };
});
vi.mock('@Query/drawDefinition/getExitProfile', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getExitProfiles: (params) => {
      calls.getExitProfiles += 1;
      return actual.getExitProfiles(params);
    },
  };
});

function counted(fn: () => any) {
  Object.keys(calls).forEach((key) => (calls[key] = 0));
  const result = fn();
  return { result, counts: { ...calls } };
}

function getDraw(drawType: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType }],
    completeAllMatchUps: true,
  });
  const event = defined(tournamentRecord.events, 'events')[0];
  const drawDefinition = defined(event.drawDefinitions, 'drawDefinitions')[0];
  return { tournamentRecord, event, drawDefinition };
}

test.each([COMPASS, FIRST_MATCH_LOSER_CONSOLATION])('%s: draw-wide inputs are built once per draw', (drawType) => {
  const { tournamentRecord, event, drawDefinition } = getDraw(drawType);
  expect(defined(drawDefinition.structures, 'structures').length).toBeGreaterThan(1);

  const { result, counts } = counted(() => getDrawData({ tournamentRecord, event, drawDefinition }));
  expect(result.structures.length).toEqual(defined(drawDefinition.structures, 'structures').length);
  expect(counts).toEqual({ hydrateParticipants: 1, getMatchUpsMap: 1, getExitProfiles: 1 });

  const structureId = defined(defined(drawDefinition.structures, 'structures').at(-1), 'value').structureId;
  expect(counted(() => getStructureData({ tournamentRecord, event, drawDefinition, structureId })).counts).toEqual({
    hydrateParticipants: 1,
    getMatchUpsMap: 1,
    getExitProfiles: 1,
  });
});

test('a STUBS request builds none of them', () => {
  const { tournamentRecord, event, drawDefinition } = getDraw(COMPASS);
  const { counts } = counted(() =>
    getDrawData({ tournamentRecord, event, drawDefinition, structuresProfile: PayloadProfileEnum.STUBS }),
  );
  expect(counts).toEqual({ hydrateParticipants: 0, getMatchUpsMap: 0, getExitProfiles: 0 });
});

test.each([COMPASS, FIRST_MATCH_LOSER_CONSOLATION])(
  '%s: each structure is exactly what hydrating it on its own produces',
  (drawType) => {
    const { tournamentRecord, event, drawDefinition } = getDraw(drawType);
    const drawData: any = getDrawData({ tournamentRecord, event, drawDefinition });

    for (const structureData of drawData.structures) {
      const structure = defined(drawDefinition.structures, 'structures').find(
        (s) => s.structureId === structureData.structureId,
      );
      const alone: any = getAllStructureMatchUps({
        seedAssignments: defined(structure, 'structure').seedAssignments?.length
          ? undefined
          : structureData.seedAssignments,
        context: { drawId: drawDefinition.drawId },
        inContext: true,
        tournamentRecord,
        drawDefinition,
        structure,
        event,
      });
      expect(structureData.roundMatchUps, structureData.structureName).toEqual(alone.roundMatchUps);
    }
  },
);
