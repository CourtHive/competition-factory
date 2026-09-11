import { removeAssignment } from '../mutations/drawDefinitions/testingUtilities';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

test('a fully-completed draw reports complete with nothing outstanding', () => {
  setSubscriptions({});
  const drawId = 'complete';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 16, drawType: SINGLE_ELIMINATION }],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getStructureCompleteness({ drawId });
  expect(result.complete).toEqual(true);
  expect(result.completeness.unassignedPositionCount).toEqual(0);
  expect(result.completeness.unplayedMatchUpCount).toEqual(0);
  expect(result.completeness.structures).toEqual([]);
});

test('a generated-but-unplayed draw reports its unplayed matchUps (positions all assigned)', () => {
  setSubscriptions({});
  const drawId = 'unplayed';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION }],
    setState: true,
  });
  const result: any = tournamentEngine.getStructureCompleteness({ drawId });
  expect(result.complete).toEqual(false);
  expect(result.completeness.unassignedPositionCount).toEqual(0);
  // an 8-draw has 7 matchUps, none played
  expect(result.completeness.unplayedMatchUpCount).toEqual(7);
  const structure = result.completeness.structures[0];
  expect(structure.unplayedMatchUps.length).toEqual(7);
  expect(structure.unplayedMatchUps[0]).toHaveProperty('roundNumber');
});

test('a manually-unassigned drawPosition is reported as unassigned', () => {
  setSubscriptions({});
  const drawId = 'manual';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: SINGLE_ELIMINATION }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structureId = drawDefinition.structures[0].structureId;
  // clear a participant's assignment WITHOUT replacing with a bye — simulates an entry slot
  // a director/pipeline has not yet filled
  removeAssignment({ drawId, structureId, drawPosition: 3, replaceWithBye: false });

  const result: any = tournamentEngine.getStructureCompleteness({ drawId });
  expect(result.complete).toEqual(false);
  const structure = result.completeness.structures.find((s) => s.structureId === structureId);
  expect(structure.unassignedPositions).toContain(3);
});

test('structureId scopes the completeness scan to a single structure', () => {
  setSubscriptions({});
  const drawId = 'scoped';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  // the playoff structure is a sibling leaf; scoping to it must exclude the group matchUps
  const playoff = drawDefinition.structures.find((s) => s.stage === 'PLAY_OFF');
  const result: any = tournamentEngine.getStructureCompleteness({ drawId, structureId: playoff.structureId });
  const reported = result.completeness.structures.map((s) => s.structureId);
  expect(reported.every((id) => id === playoff.structureId)).toEqual(true);
});
