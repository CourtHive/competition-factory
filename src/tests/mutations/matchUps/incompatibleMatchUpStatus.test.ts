import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { it, expect } from 'vitest';

// constants
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';

it('will reject WO/WO for an updated result on matchUp with downstream dependencies', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
    completeAllMatchUps: true,
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.every(({ winningSide }) => winningSide)).toEqual(true);
  const targetMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 1);

  let params: any = {
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      score: {
        scoreStringSide1: '',
        scoreStringSide2: '',
      },
      matchUpStatus: 'CANCELLED',
    },
    drawId,
  };

  result = tournamentEngine.setMatchUpStatus(params);
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

  params = {
    matchUpId: targetMatchUp.matchUpId,
    outcome: {
      score: {
        scoreStringSide1: '',
        scoreStringSide2: '',
      },
      matchUpStatus: 'DOUBLE_WALKOVER',
      matchUpStatusCodes: ['WOWO', 'WOWO'],
    },
    drawId,
  };

  result = tournamentEngine.setMatchUpStatus(params);
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
});
