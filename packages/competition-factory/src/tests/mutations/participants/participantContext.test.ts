import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import POLICY_POSITION_ACTIONS_UNRESTRICTED from '@Fixtures/policies/POLICY_POSITION_ACTIONS_UNRESTRICTED';
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';

test('hydrated consolation matchUps include seeding when participants advance', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: {
      [POLICY_TYPE_FEED_IN]: { feedFromMainFinal: true },
    },
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        seedsCount: 2,
        drawSize: 4,
        outcomes: [
          {
            drawPositions: [1, 2],
            scoreString: '6-1 6-2',
            winningSide: 2,
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  let structures = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;

  // get seeded participants from MAIN structure
  const seedAssignments = structures.find(({ stage }) => stage === MAIN).seedAssignments;
  const seededParticipantIds = seedAssignments.map(({ participantId }) => participantId);
  const consolationStructureId = structures.find(({ stage }) => stage === CONSOLATION).structureId;

  // get positionActions for empty drawPosition in CONSOLATION
  let result = tournamentEngine.positionActions({
    policyDefinitions: POLICY_POSITION_ACTIONS_UNRESTRICTED,
    structureId: consolationStructureId,
    drawPosition: 3,
    drawId,
  });

  const alternateOption = result.validActions.find(({ type }) => type === ALTERNATE);
  const { method, payload, availableAlternatesParticipantIds } = alternateOption;
  const alternateParticipantId = availableAlternatesParticipantIds.find((participantId) =>
    seededParticipantIds.includes(participantId),
  );
  Object.assign(payload, { alternateParticipantId });

  // assign seeded participant to CONSOLATION drawPosition
  result = tournamentEngine[method](payload);

  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  const firstRoundFirstPositionMain = matchUps.find(
    ({ roundNumber, roundPosition, stage }) => stage === MAIN && roundNumber === 1 && roundPosition === 1,
  );

  expect(firstRoundFirstPositionMain.sides[0].seedValue).toEqual(1);

  const firstSeedParticipantId = firstRoundFirstPositionMain.sides[0].participantId;

  const firstRoundFirstPositionConsolation = matchUps.find(
    ({ roundNumber, roundPosition, stage }) => stage === CONSOLATION && roundNumber === 1 && roundPosition === 1,
  );

  expect(firstRoundFirstPositionConsolation.sides[0].participantId).toEqual(firstSeedParticipantId);

  structures = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;

  const consolationStructure = structures.find((structure) => structure.stage === CONSOLATION);

  expect(consolationStructure.seedAssignments[0].seedValue).toEqual(1);

  result = tournamentEngine.getEventData({ eventId });
  expect(result.eventData.drawsData[0].structures[1].roundMatchUps[1][0].sides[0].seedValue).toEqual(1);

  expect(consolationStructure.seedAssignments.length).toEqual(2);

  /*
  console.log(
    matchUps.map(({ finishingPositionRange }) => finishingPositionRange)
  );
  */
});
