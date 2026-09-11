import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { FEED_IN_CHAMPIONSHIP_TO_QF } from '@Constants/drawDefinitionConstants';
import { BYE, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES } from '@Constants/eventConstants';

tournamentEngine.devContext(true);

it('propagates a double wo as a bye for a feed in consolation match', () => {
  const participantsProfile = {
    participantType: INDIVIDUAL,
    participantsCount: 32,
  };
  const drawProfiles = [
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_QF,
      participantsCount: 32,
      eventType: SINGLES,
      idPrefix: 'm',
      drawSize: 32,
      outcomes: [
        {
          roundPosition: 1,
          scoreString: '6-2 6-1',
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-2 6-1',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          roundPosition: 15,
          scoreString: '6-2 6-1',
          roundNumber: 1,
          winningSide: 1,
        },
        {
          roundPosition: 16,
          scoreString: '6-2 6-1',
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    drawProfiles,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: 'm-2-1',
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    drawId,
  });
  expect(result.success).toEqual(true);

  let { completedMatchUps, byeMatchUps } = tournamentEngine.tournamentMatchUps();

  const doubleWOMatch = completedMatchUps.find((m) => m.matchUpId === 'm-2-1');
  expect(doubleWOMatch?.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  //the consolation match that does not receive a player out of the double walkover
  //is then set as a BYE
  const feedInConsolationMatchCR16 = byeMatchUps.find((m) => m.matchUpId === 'm-c-2-8');
  expect(feedInConsolationMatchCR16?.matchUpStatus).toEqual(BYE);

  //then also the Consolation Quarter Final match that would have received the loser of
  //the Main Draw Quarter final is set as a BYE
  const feedInConsolationMatchCQF = byeMatchUps.find((m) => m.matchUpId === 'm-c-4-1');
  expect(feedInConsolationMatchCQF?.matchUpStatus).toEqual(BYE);
});
