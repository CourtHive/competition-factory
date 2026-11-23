import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

it('can generate an event with a draw and attach it to a tournamentRecord', () => {
  tournamentEngine.devContext(true);
  const matchUpAddNotices: number[] = [];
  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices.push(matchUps.length);
        });
      }
    },
  };

  setSubscriptions({ subscriptions });

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100 },
  });
  expect(tournamentRecord.participants.length).toEqual(100);

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        roundTarget: 1,
        structureProfiles: [
          { stageSequence: 1, drawSize: 32, qualifyingRoundNumber: 3 },
          { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
        ],
      },
      {
        roundTarget: 2,
        structureProfiles: [
          {
            qualifyingPositions: 4,
            drawType: ROUND_ROBIN,
            stageSequence: 2,
            drawSize: 16,
          },
          { stageSequence: 2, drawSize: 16, qualifyingPositions: 4 },
        ],
      },
    ],
    drawType: FEED_IN,
    placeByes: false,
    drawSize: 48,
  });
  expect(drawDefinition.structures.length).toEqual(5);
  expect(drawDefinition.links.length).toEqual(4);

  const event = { drawDefinitions: [drawDefinition] };
  let result = tournamentEngine.addEvent({ event });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.addEvent({ event, internalUse: true });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUpAddNotices).toEqual([123]);
  expect(matchUps.length).toEqual(123);

  const mainStageMatchUps = matchUps.filter(({ stage }) => stage === MAIN);
  // should equal 31 + 16 (second round feed) => 47
  expect(mainStageMatchUps.length).toEqual(47);

  const qualifyingStageOne = matchUps.filter(({ stage, stageSequence }) => stage === QUALIFYING && stageSequence === 1);
  // should equal (16 + 8 + 4) + 24 => 52
  expect(qualifyingStageOne.length).toEqual(52);

  const qualifyingStageTwo = matchUps.filter(({ stage, stageSequence }) => stage === QUALIFYING && stageSequence === 2);
  // should equal (8 + 4) + (8 + 4) => 24
  expect(qualifyingStageTwo.length).toEqual(24);

  // generated with no entries, the main places nothing until it is positioned (CA, 2026-10-09: "the slots for
  // qualifiers shouldn't be reserved in advance at all, those qualifying placeholders or the qualifiers themselves get
  // placed when the draw positioning is generated")
  const generatedMain = event.drawDefinitions[0].structures.find(({ stage }) => stage === MAIN);
  expect(generatedMain.positionAssignments.filter(({ qualifier }) => qualifier).length).toEqual(0);
  const drawId = drawDefinition.drawId;
  result = tournamentEngine.automatedPositioning({ structureId: generatedMain.structureId, placeByes: false, drawId });
  expect(result.success).toEqual(true);

  // the qualifiers are placed in the round their qualifying profile targets
  const mainStructure = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find(({ stage }) => stage === MAIN);

  const firstRoundQualifiersCount = mainStructure.positionAssignments
    .filter((assignment) => assignment.drawPosition > 16)
    .filter(({ qualifier }) => qualifier).length;
  const secondRoundQualifiersCount = mainStructure.positionAssignments
    .filter((assignment) => assignment.drawPosition < 17)
    .filter(({ qualifier }) => qualifier).length;

  expect(firstRoundQualifiersCount).toEqual(4);
  expect(secondRoundQualifiersCount).toEqual(4);
});
