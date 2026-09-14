import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { SCORES_PRESENT } from '@Constants/errorConditionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';

test('participantResults recalculated when manually scored TEAM matchUps deleted', async () => {
  const drawId = 'did';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        tieFormatName: DOMINANT_DUO,
        drawType: AD_HOC,
        eventType: TEAM,
        automated: true,
        roundsCount: 4,
        idPrefix: 'm',
        drawSize: 5,
        drawId,
      },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, matchUpFilters: { matchUpTypes: [TEAM] } });
  expect(matchUps[0].tieMatchUps.length).toBe(3);
  expect(matchUps.length).toBe(8);

  const matchUpId = matchUps[0].matchUpId;
  const winningSide = 1;

  const methods = [
    {
      method: 'setMatchUpStatus',
      params: {
        disableAutoCalc: true, // manual scoring
        drawId,
        matchUpId,
        outcome: {
          winningSide,
          score: {
            scoreStringSide1: '0-0',
            scoreStringSide2: '0-0',
            sets: [
              {
                games: [],
                side1Score: 0,
                side2Score: 0,
                winningSide: 1,
              },
            ],
          },
        },
      },
    },
  ];

  const executionResult = tournamentEngine.executionQueue(methods);
  expect(executionResult.success).toEqual(true);

  const participantId = matchUps[0].sides.find((side) => side.sideNumber === winningSide).participantId;
  let eventData = tournamentEngine.getEventData({ drawId, participantsProfile: { withScaleValues: true } }).eventData;
  expect(eventData.drawsData[0].structures[0].participantResults.length).toBe(5);
  let targetResult = eventData.drawsData[0].structures[0].participantResults.find(
    (result) => result.participantId === participantId,
  ).participantResult;
  expect(targetResult.matchUpsPct).toBe(1);

  let deletionResult = tournamentEngine.deleteAdHocMatchUps({ drawId, matchUpIds: [matchUpId] });
  expect(deletionResult.error).toEqual(SCORES_PRESENT);
  deletionResult = tournamentEngine.deleteAdHocMatchUps({ drawId, matchUpIds: [matchUpId], removeCompleted: true });
  expect(deletionResult.success).toEqual(true);
  expect(deletionResult.deletedMatchUpsCount).toBe(4); // Team matchUp and Singles, Doubles tieMatchUps

  eventData = tournamentEngine.getEventData({ drawId, participantsProfile: { withScaleValues: true } }).eventData;
  targetResult = eventData.drawsData[0].structures[0].participantResults.find(
    (result) => result.participantId === participantId,
  ).participantResult;
  expect(targetResult.matchUpsPct).toBe(0);
});
