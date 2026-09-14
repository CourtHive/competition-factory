import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WITHDRAWN } from '@Constants/entryStatusConstants';
import { ASSIGN_BYE, REMOVE_ASSIGNMENT } from '@Constants/positionActionConstants';

it('can replace positioned participant with a bye and move to ALTERNATEs', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  const drawPosition = 1;
  let result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ASSIGN_BYE)).toEqual(true);
  let option = result.validActions.find((action) => action.type === ASSIGN_BYE);

  let payload = {
    ...option.payload,
    replaceWithBye: true,
    entryStatus: ALTERNATE,
  };
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);

  ({
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));

  let { positionAssignments } = structures[0];
  let assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(assignment.bye).toEqual(true);

  // Now test that a BYE can be removed
  result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });

  option = result.validActions.find((action) => action.type === REMOVE_ASSIGNMENT);

  payload = { ...option.payload };
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);

  ({
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));

  ({ positionAssignments } = structures[0]);
  assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(assignment.bye).toBeUndefined();

  // now check that BYE can be placed
  result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });

  option = result.validActions.find((action) => action.type === ASSIGN_BYE);
  payload = { ...option.payload };
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);

  ({
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));

  ({ positionAssignments } = structures[0]);
  assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(assignment.bye).toEqual(true);
});

it('can withdraw and replace positioned participant with a bye', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    event,
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  let { byeMatchUps } = tournamentEngine.drawMatchUps({ drawId });
  expect(byeMatchUps.length).toEqual(2);

  const drawPosition = 1;
  let { positionAssignments } = structures[0];
  let assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(!!assignment.bye).toEqual(false);
  let byeAssignments = positionAssignments.filter(({ bye }) => bye);
  expect(byeAssignments.length).toEqual(2);

  expect(byeAssignments.length).toEqual(2);
  const participantId = positionAssignments.find(
    (assignment) => assignment.drawPosition === drawPosition,
  ).participantId;
  const entryStatus = event.entries.find((entry) => entry.participantId === participantId).entryStatus;
  expect(entryStatus).toEqual(DIRECT_ACCEPTANCE);

  let result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });
  expect(result.isDrawPosition).toEqual(true);
  expect(result.isByePosition).toEqual(false);
  const options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(ASSIGN_BYE)).toEqual(true);
  const option = result.validActions.find((action) => action.type === ASSIGN_BYE);

  const payload = {
    ...option.payload,
    replaceWithBye: true,
    entryStatus: WITHDRAWN,
  };
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);

  ({
    event,
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));

  const updatedEntryStatus = event.entries.find((entry) => entry.participantId === participantId).entryStatus;
  expect(updatedEntryStatus).toEqual(WITHDRAWN);

  ({ positionAssignments } = structures[0]);
  assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(assignment.bye).toEqual(true);
  byeAssignments = positionAssignments.filter(({ bye }) => bye);
  expect(byeAssignments.length).toEqual(3);

  ({ byeMatchUps } = tournamentEngine.drawMatchUps({ drawId }));
  expect(byeMatchUps.length).toEqual(3);
});
