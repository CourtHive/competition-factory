import { replaceWithAlternate, replaceWithBye } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { getDrawPosition } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { ALTERNATE_PARTICIPANT, ASSIGN_BYE } from '@Constants/positionActionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';

it('supports replacing a BYE with a participant (DA or ALT)', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 30,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    inContext: true,
    drawProfiles,
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
  let options = result.validActions?.map((validAction) => validAction.type);

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

  const { positionAssignments } = structures[0];
  const assignment = positionAssignments.find((assignment) => assignment.drawPosition === drawPosition);
  expect(assignment.bye).toEqual(true);

  // test that availableAlternates will not be returned with { returnParticipants: false }
  result = tournamentEngine.positionActions({
    returnParticipants: false,
    drawPosition,
    structureId,
    drawId,
  });
  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(BYE)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(true);

  option = result.validActions.find((action) => action.type === ALTERNATE_PARTICIPANT);
  expect(option.availableAlternates).toBeUndefined();

  // Now test that a BYE can be replaced
  result = tournamentEngine.positionActions({
    drawId,
    structureId,
    drawPosition,
  });
  options = result.validActions?.map((validAction) => validAction.type);
  expect(options.includes(BYE)).toEqual(false);
  expect(options.includes(ALTERNATE_PARTICIPANT)).toEqual(true);

  option = result.validActions.find((action) => action.type === ALTERNATE_PARTICIPANT);
  expect(option.availableAlternates.length).toEqual(3);

  const alternateParticipantId = option.availableAlternatesParticipantIds[0];
  payload = { ...option.payload, alternateParticipantId };
  result = tournamentEngine[option.method](payload);
  expect(result.success).toEqual(true);
});

it('can replace BYE with ALTERNATE to Final in drawSize: 8 when 7 BYEs', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 8,
      alternatesCount: 10,
    },
  ];
  const { drawIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 32 },
    inContext: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);
  const drawId = drawIds[0];

  let {
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId });
  const structureId = structures[0].structureId;

  const targetByeDrawPositions = generateRange(2, 9);
  targetByeDrawPositions.forEach((drawPosition) => {
    const result = replaceWithBye({
      drawId,
      structureId,
      drawPosition,
    });
    if (result.error) console.log('replaceWithBye', { drawPosition }, result);
  });

  ({
    drawDefinition: { structures },
  } = tournamentEngine.getEvent({ drawId }));
  const { positionAssignments } = structures[0];
  const byeDrawPositions = positionAssignments.filter(({ bye }) => bye).map(getDrawPosition);

  expect(byeDrawPositions).toEqual(targetByeDrawPositions);

  replaceWithAlternate({ drawId, structureId, drawPosition: 8 });
  let { matchUps } = tournamentEngine.allDrawMatchUps({ drawId });
  let finalMatchUp = matchUps.find(({ finishingRound }) => finishingRound === 1);
  expect(finalMatchUp.drawPositions).toEqual([1, 8]);
  expect(finalMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

  replaceWithBye({
    drawId,
    structureId,
    drawPosition: 8,
  });
  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
  finalMatchUp = matchUps.find(({ finishingRound }) => finishingRound === 1);
  expect(finalMatchUp.matchUpStatus).toEqual(BYE);

  expect(finalMatchUp.drawPositions).toEqual([1, 7]);

  const result = replaceWithAlternate({ drawId, structureId, drawPosition: 7 });
  expect(result.success).toEqual(true);
  ({ matchUps } = tournamentEngine.allDrawMatchUps({ drawId }));
  finalMatchUp = matchUps.find(({ finishingRound }) => finishingRound === 1);
  expect(finalMatchUp.drawPositions).toEqual([1, 7]);
  expect(finalMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
});
