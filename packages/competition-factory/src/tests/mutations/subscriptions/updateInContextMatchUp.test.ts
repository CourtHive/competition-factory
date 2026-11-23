import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

it('should provide a context update when a matchUp is updated', () => {
  const inContextMatchUps: any[] = [];
  const subscriptions = {
    updateInContextMatchUp: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ inContextMatchUp }) => inContextMatchUps.push(inContextMatchUp));
      }
    },
  };

  setSubscriptions({ subscriptions });

  const drawType = SINGLE_ELIMINATION;
  const drawId = 'did';

  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 2, drawId, drawType }], setState: true });

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  const matchUpId = tournamentEngine.allTournamentMatchUps().matchUps[0].matchUpId;
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toBe(true);
  expect(true).toBe(true);

  expect(inContextMatchUps.length).toBe(1);
  expect(inContextMatchUps[0].drawType).toEqual(drawType);
});
