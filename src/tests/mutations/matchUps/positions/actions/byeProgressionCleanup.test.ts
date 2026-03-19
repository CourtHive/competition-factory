import { replaceWithBye, assignDrawPosition } from '../../../drawDefinitions/testingUtilities';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';

it('will remove BYEs fed into CONSOLATION', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
        participantsCount: 14,
        drawSize: 16,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const assignmentNotifications: number[][] = [];
  const matchUpModifyNotices: any = [];

  const subscriptions = {
    [MODIFY_MATCHUP]: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUp }) => {
          matchUpModifyNotices.push(matchUp);
        });
      }
    },
    [MODIFY_POSITION_ASSIGNMENTS]: (positions) => {
      assignmentNotifications.push(positions);
    },
  };

  setSubscriptions({ subscriptions });

  let {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const assignedByes = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(assignedByes.length).toEqual(2);

  let consolationAssignedByes = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(consolationAssignedByes.length).toEqual(2);

  expect(matchUpModifyNotices.length).toEqual(0);
  expect(assignmentNotifications.flat().length).toEqual(0);

  // replace 2nd seed position with a bye creating a bye-progressed bye in main 2nd round
  // and propagating a bye to consolation 2nd round
  const drawPosition = 16;
  let result = replaceWithBye({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(matchUpModifyNotices.length).toEqual(4);

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  consolationAssignedByes = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(consolationAssignedByes.length).toEqual(3);

  const secondRoundConsolationByeMatchUps = consolationStructure.matchUps.filter(
    ({ matchUpStatus, roundNumber }) => matchUpStatus === BYE && roundNumber === 2,
  );
  expect(secondRoundConsolationByeMatchUps.length).toEqual(1);
  const targetMatchUpId = secondRoundConsolationByeMatchUps[0].matchUpId;

  expect(assignmentNotifications.flat().length).toEqual(2);
  // assign a participant to the original drawPosition
  assignDrawPosition({
    structureId: mainStructure.structureId,
    drawPosition,
    drawId,
  });
  expect(matchUpModifyNotices.length).toEqual(7);
  expect(assignmentNotifications.flat().length).toEqual(4);

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  const targetMatchUp = consolationStructure.matchUps.find(({ matchUpId }) => matchUpId === targetMatchUpId);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(mainStructure).toBeDefined();
});
