import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONSOLATION } from '@Constants/drawDefinitionConstants';

import tournamentOne from './tournamentOne.tods.json';
import tournamentTwo from './tournamentTwo.tods.json';

it('WO/WO advances SF player to F and sets winningSide', () => {
  tournamentEngine.setState(tournamentOne);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
  });

  const targetMatchUp = matchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === CONSOLATION && roundNumber === 4 && roundPosition === 2,
  );
  const { drawId, matchUpId } = targetMatchUp;
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('WO/WO advances SF player to F and sets winningSide', () => {
  tournamentEngine.setState(tournamentTwo);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
  });

  const targetMatchUp = matchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === CONSOLATION && roundNumber === 4 && roundPosition === 2,
  );
  const { drawId, matchUpId } = targetMatchUp;
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
});
