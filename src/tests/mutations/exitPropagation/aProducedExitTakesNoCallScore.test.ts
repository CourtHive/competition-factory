import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * THE CALL'S SCORE STAYS ON THE MATCHUP IT WAS ENTERED ON. `doubleExitAdvancement` spread the call's params into the
 * write of the exit a double exit produces, so a score the double exit's call carried landed on the produced exit's
 * matchUp too: a produced DEFAULTED kept it. Found by the outcome pipeline v2's differential (`pruneDrawCoverage`, whose
 * mock outcome gives a double default an empty score object).
 */
it('a double default entered with a score object writes none onto the default it produces', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.find((m: any) => m.roundNumber === 1 && m.roundPosition === 1);
  const score = { sets: [], scoreStringSide1: '', scoreStringSide2: '' };
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT, score },
    matchUpId: first.matchUpId,
    drawId: 'd',
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'd' });
  const stored = drawDefinition.structures[0].matchUps;
  const produced = stored.find((m: any) => m.matchUpId === first.winnerMatchUpId);
  // CONTROL: the double default produced its default in round 2
  expect(produced.matchUpStatus).toEqual(DEFAULTED);
  expect(produced.score).toBeUndefined();
});
