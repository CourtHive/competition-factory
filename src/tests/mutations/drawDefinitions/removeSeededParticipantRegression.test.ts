import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { MODIFY_SEED_ASSIGNMENTS, MODIFY_DRAW_DEFINITION } from '@Constants/topicConstants';
import { REMOVE_SEED } from '@Constants/positionActionConstants';
import { NOT_FOUND } from '@Constants/errorConditionConstants';

afterEach(() => setSubscriptions({ subscriptions: {} }));

it.each([false, true])('removes seeding and announces the change (position action: %s)', (positionAction) => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, seedsCount: 2 }],
    nonRandom: 1,
    setState: true,
  });
  const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures[0];
  const { structureId } = structure;
  const before = structuredClone(structure.seedAssignments);
  const positions = structuredClone(structure.positionAssignments);
  const { participantId, seedNumber } = before[0];
  expect(participantId).toBeTruthy();
  expect(before[1].participantId).toBeTruthy();

  const seedNotices: any[] = [];
  const drawNotices: any[] = [];
  setSubscriptions({
    subscriptions: {
      [MODIFY_SEED_ASSIGNMENTS]: (payloads) => seedNotices.push(...payloads),
      [MODIFY_DRAW_DEFINITION]: (payloads) => drawNotices.push(...payloads),
    },
  });

  const params = { drawId, structureId, participantId };
  let result: any;
  if (positionAction) {
    const drawPosition = positions.find((assignment) => assignment.participantId === participantId).drawPosition;
    const { validActions } = tournamentEngine.positionActions({ drawId, structureId, drawPosition });
    const action = validActions.find(({ type }) => type === REMOVE_SEED);
    expect(action).toBeDefined();
    result = tournamentEngine[action.method](action.payload);
  } else {
    result = tournamentEngine.removeSeededParticipant(params);
  }
  expect(result.success).toBe(true);

  const updated = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0];
  expect(updated.seedAssignments).toEqual(
    before.map((assignment) =>
      assignment.seedNumber === seedNumber ? { ...assignment, participantId: undefined } : assignment,
    ),
  );
  expect(updated.positionAssignments).toEqual(positions);
  expect(seedNotices).toHaveLength(1);
  expect(seedNotices[0]).toMatchObject({
    drawId,
    structureId,
    eventId: event.eventId,
    seedAssignments: updated.seedAssignments,
  });
  expect(drawNotices).toHaveLength(1);

  const state = tournamentEngine.getTournament();
  result = tournamentEngine.removeSeededParticipant(params);
  expect(result.error).toEqual(NOT_FOUND);
  expect(tournamentEngine.getTournament()).toEqual(state);
  expect(seedNotices).toHaveLength(1);
  expect(drawNotices).toHaveLength(1);
});
