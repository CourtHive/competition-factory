import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';
import { PRODUCTION_STATUS_CODES } from '@Tests/testHarness/statusCodes/productionVocabulary';

// constants
import { DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';

/**
 * Every code in a deployed production vocabulary survives verbatim: submitted keyed, it is stored keyed, on the side it
 * names. These are exhaustive over the vocabulary rather than sampled: the failure mode is per-code.
 */
test.for(PRODUCTION_STATUS_CODES)('$category $code is stored as submitted', ({ code }) => {
  const drawId = 'production-code';
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }], setState: true });
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 2, sideStatusCodes: { 1: code } },
    matchUpId: 'm-1-1',
    drawId,
  });
  expect(result.success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId: 'm-1-1' });
  expect(matchUp.sideStatusCodes).toEqual({ 1: code });
  expect(matchUp.matchUpStatusCodes).toBeUndefined();
});

/**
 * End-to-end: a real production code, carried on a scored matchUp, through actual propagation. A DOUBLE_DEFAULT
 * upstream, then a DEFAULTED carrying `DQ` with propagateExitStatus: the reason rides with the side that exited onto
 * the consolation matchUp, and the side the DOUBLE_DEFAULT produced carries no reason, because none was given.
 */
it('carries a production code through propagation without relabelling it', () => {
  const idPrefix = 'matchUp';
  const drawId = 'production-codes';
  mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT, sideStatusCodes: { 1: 'DD', 2: 'DD' } },
    matchUpId: `${idPrefix}-1-1`,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 2, sideStatusCodes: { 1: 'DQ' } },
    propagateExitStatus: true,
    matchUpId: `${idPrefix}-1-2`,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const scored = matchUps?.find((m: any) => m.matchUpId === `${idPrefix}-1-2`);
  const consolation = matchUps?.find((m: any) => m.matchUpId === scored?.loserMatchUpId);

  expect(consolation?.sideStatusCodes).toEqual({ 2: 'DQ' });
  expect(consolation?.matchUpStatusCodes).toBeUndefined();
});
