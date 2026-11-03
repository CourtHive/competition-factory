import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { MODIFY_SEED_ASSIGNMENTS, MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

afterEach(() => setSubscriptions({ subscriptions: {} }));

function setup(participantsCount = 32, seeded = true) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, participantsCount, seedsCount: 4 }],
    nonRandom: 1,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const seededIds = new Set(structure.seedAssignments.map((assignment) => assignment.participantId));
  const participantId = seeded
    ? structure.seedAssignments[0].participantId
    : structure.positionAssignments.find(
        (assignment) => assignment.participantId && !seededIds.has(assignment.participantId),
      ).participantId;
  return { drawId, structureId: structure.structureId, participantId };
}

it.each([66, '66', '5-66', '66-5', Infinity])(
  'refuses seed value %s above a 32-position draw without writes or notices',
  (seedValue) => {
    const params = setup();
    const before = tournamentEngine.getTournament();
    const notices: any[] = [];
    setSubscriptions({
      subscriptions: {
        [MODIFY_SEED_ASSIGNMENTS]: (payloads) => notices.push(...payloads),
        [MODIFY_DRAW_DEFINITION]: (payloads) => notices.push(...payloads),
      },
    });
    let result: any = tournamentEngine.modifySeedAssignment({ ...params, seedValue });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getTournament()).toEqual(before);
    expect(notices).toHaveLength(0);
  },
);

it.each([true, false])(
  'rejects an impossible value for a newly seeded participant with validation=%s',
  (validation) => {
    const params = setup(32, false);
    const before = tournamentEngine.getTournament();
    let result: any = tournamentEngine.modifySeedAssignment({ ...params, seedValue: 66, validation });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(tournamentEngine.getTournament()).toEqual(before);
  },
);

it('uses the non-BYE participant capacity rather than the power-of-two draw size', () => {
  const params = setup(24);
  let result: any = tournamentEngine.modifySeedAssignment({ ...params, seedValue: 25 });
  expect(result.error).toEqual(INVALID_VALUES);
  result = tournamentEngine.modifySeedAssignment({ ...params, seedValue: '17-24' });
  expect(result.success).toBe(true);
});

it('bounds a round-robin group by its containing draw rather than one group size', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: ROUND_ROBIN, seedsCount: 8 }],
    nonRandom: 1,
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const group = drawDefinition.structures[0].structures[0];
  const participantId = group.positionAssignments[0].participantId;
  expect(group.positionAssignments.length).toBeLessThan(32);
  let result: any = tournamentEngine.modifySeedAssignment({
    drawId,
    structureId: group.structureId,
    participantId,
    seedValue: 32,
  });
  expect(result.success).toBe(true);
  const before = tournamentEngine.getTournament();
  result = tournamentEngine.modifySeedAssignment({
    drawId,
    structureId: group.structureId,
    participantId,
    seedValue: 33,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(tournamentEngine.getTournament()).toEqual(before);
});

it.each([32, '32', '17-32', '5-8', 0, '0', '', undefined])(
  'retains supported value or clearing input %s',
  (seedValue) => {
    const params = setup();
    let result: any = tournamentEngine.modifySeedAssignment({ ...params, seedValue });
    expect(result.success).toBe(true);
  },
);
