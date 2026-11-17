import { recordWholeCall } from '@Mutate/matchUps/outcome/plan/recordedCall';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, vi } from 'vitest';

// constants
import { RETIRED } from '@Constants/matchUpStatusConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';

vi.mock('@Mutate/matchUps/outcome/plan/recordedCall', async (original) => {
  const actual = await original<typeof import('@Mutate/matchUps/outcome/plan/recordedCall')>();
  return { ...actual, recordWholeCall: vi.fn(actual.recordWholeCall) };
});

/**
 * A call v2 refuses has no route, and its refusal is the answer. Under `differential` such a call is still planned so
 * that v1's refusal is set against v2's, and its plan abstains `exit`, one of the reasons a whole-call recording
 * answers. No recording is asked for there: v1 on a copy of the record would only return the same error.
 */
it('is not asked for where the call is refused', () => {
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId: 'd', drawSize: 8 }], setState: true });
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const seated = matchUps.find((matchUp) => matchUp.roundNumber === 1);
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: RETIRED },
    matchUpId: seated.matchUpId,
    drawId: 'd',
  });

  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
  expect(recordWholeCall).not.toHaveBeenCalled();
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
});
