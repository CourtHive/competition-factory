import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A RESULT CARRIES NO PLUMBING. A direction hands exit propagation its loser's next matchUp (hydrated), the call's live
 * `matchUpsMap` and the source's facts in `context`, and `setMatchUpStatus` returned that context to its caller: a
 * carried walkover's result held the whole draw's matchUps. The propagation consumes them; the result does not carry
 * them.
 */
it('a carried exit returns no propagation context', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const first = matchUps.find((m: any) => m.structureName === 'Main' && m.roundNumber === 1 && m.roundPosition === 1);
  const outcome = generateOutcomeFromScoreString({ matchUpStatus: WALKOVER, winningSide: 1 }).outcome;
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    propagateExitStatus: true,
    drawId: 'd',
    outcome,
  });
  expect(result.success).toEqual(true);

  // CONTROL: the exit was carried, so the call did hand propagation its context
  const consolation = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((m: any) => m.matchUpId === first.loserMatchUpId);
  expect(consolation.matchUpStatus).toEqual(WALKOVER);

  for (const key of ['matchUpsMap', 'loserMatchUp', 'progressExitStatus', 'loserParticipantId', 'sourceMatchUpId'])
    expect(result.context?.[key]).toBeUndefined();
});
