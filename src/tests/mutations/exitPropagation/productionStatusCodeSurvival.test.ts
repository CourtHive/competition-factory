import {
  PRODUCTION_STATUS_CODES,
  PRODUCTION_STATUS_CODES_BY_CATEGORY,
} from '@Tests/testHarness/statusCodes/productionVocabulary';
import { exitOutcomeCode, getSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { updateMatchUpStatusCodes } from '@Mutate/drawDefinitions/matchUpGovernor/matchUpStatusCodes';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OUTCOME_WALKOVER } from '@Helpers/keyValueScore/constants';

/**
 * Every code in a deployed production vocabulary must survive every shape it can take.
 *
 * The array these travel in is polymorphic — a code can be a bare string, or wrapped as `{ code }`
 * by `updateMatchUpStatusCodes`, or sit beside propagation provenance. A coercion in
 * `progressExitStatus` used to rewrite every object element to `OUTCOME_WALKOVER`, so a code that
 * had been wrapped could come back out as a walkover.
 *
 * These are exhaustive over the vocabulary rather than sampled: the failure mode is per-code, and a
 * sample would have passed on the codes that happen to be walkovers already.
 */

test.for(PRODUCTION_STATUS_CODES)('$category $code survives every element shape', ({ code, display }) => {
  expect(code).not.toEqual('');

  // 1. a bare string passes through untouched
  expect(exitOutcomeCode(code)).toEqual(code);

  // 2. wrapped by updateMatchUpStatusCodes — the shape that used to become 'WO'
  expect(exitOutcomeCode({ code })).toEqual(code);

  // 3. the policy vocabulary shape, carrying its display form
  expect(exitOutcomeCode({ matchUpStatusCode: code, matchUpStatusCodeDisplay: display })).toEqual(code);

  // 4. wrapped AND stamped with provenance, which is what the array actually holds mid-propagation
  expect(exitOutcomeCode({ code, previousMatchUpStatus: DOUBLE_WALKOVER, sideNumber: 1 })).toEqual(code);
});

test.for(PRODUCTION_STATUS_CODES.filter(({ code }) => code !== OUTCOME_WALKOVER))(
  '$category $code is never relabelled as a walkover',
  ({ code }) => {
    // the defect this vocabulary exists to pin: every object element became OUTCOME_WALKOVER
    for (const shape of [{ code }, { matchUpStatusCode: code }, { code, sideNumber: 2 }]) {
      expect(exitOutcomeCode(shape)).not.toEqual(OUTCOME_WALKOVER);
    }
  },
);

it('survives the wrapper that updateMatchUpStatusCodes applies, for the whole vocabulary', () => {
  // updateMatchUpStatusCodes wraps string elements as `{ code }` before stamping provenance.
  // Drive the real function, not a hand-built shape, so the test tracks the wrapper if it changes.
  const sourceMatchUpId = 'source-1';
  const codes = PRODUCTION_STATUS_CODES.map(({ code }) => code);

  const matchUp: any = { matchUpId: 'target-1', matchUpStatusCodes: [...codes] };
  const sourceMatchUp: any = { matchUpId: sourceMatchUpId, structureId: 's1', roundPosition: 1 };
  const pairedMatchUp: any = { matchUpId: 'paired-1', structureId: 's1', roundPosition: 2 };

  updateMatchUpStatusCodes({
    inContextDrawMatchUps: [sourceMatchUp, pairedMatchUp],
    matchUpsMap: { drawPositionsToMatchUps: {}, mappedMatchUps: {} } as any,
    sourceMatchUpStatus: DOUBLE_WALKOVER,
    sourceMatchUpId,
    matchUp,
  });

  // whatever the wrapper did, every original code must still be recoverable
  const recovered = (matchUp.matchUpStatusCodes ?? []).map(exitOutcomeCode);
  expect(recovered).toEqual(codes);

  // and none of them may be mistaken for propagation provenance
  expect(getSideExitProvenance({ matchUp })).toBeUndefined();
});

it('keeps each category distinguishable rather than collapsing it to a walkover', () => {
  const categories = Object.keys(PRODUCTION_STATUS_CODES_BY_CATEGORY);
  expect(categories.length).toBeGreaterThanOrEqual(5);

  for (const category of categories) {
    const resolved = PRODUCTION_STATUS_CODES_BY_CATEGORY[category].map(({ code }) => exitOutcomeCode({ code }));
    // every code in the category comes back as itself — the categories stay separable
    expect(resolved).toEqual(PRODUCTION_STATUS_CODES_BY_CATEGORY[category].map(({ code }) => code));
  }

  // the vocabulary is not accidentally all-walkovers: only the walkover category maps to 'WO'
  const nonWalkoverCodes = PRODUCTION_STATUS_CODES.filter(({ category }) => category !== 'Walkovers');
  expect(nonWalkoverCodes.every(({ code }) => exitOutcomeCode({ code }) !== OUTCOME_WALKOVER)).toEqual(true);
});

it('does not confuse a production code with exit provenance', () => {
  // provenance is recognised by previousMatchUpStatus, not by carrying a code
  const codesOnly: any = { matchUpId: 'm', matchUpStatusCodes: PRODUCTION_STATUS_CODES.map(({ code }) => ({ code })) };
  expect(getSideExitProvenance({ matchUp: codesOnly })).toBeUndefined();

  const withProvenance: any = {
    matchUpId: 'm2',
    matchUpStatusCodes: [
      { code: 'DQ', previousMatchUpStatus: DOUBLE_WALKOVER, matchUpStatus: WALKOVER, sideNumber: 1 },
    ],
  };
  const provenance: any = getSideExitProvenance({ matchUp: withProvenance });
  expect(provenance[1].previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  // ...and the code is still recoverable from the same element
  expect(exitOutcomeCode(withProvenance.matchUpStatusCodes[0])).toEqual('DQ');
});

/**
 * End-to-end: a real production code, carried on a scored matchUp, through actual propagation.
 *
 * The element-shape tests above are exhaustive but synthetic. This one drives the engine: a
 * DOUBLE_WALKOVER upstream, then a DEFAULTED carrying `DQ` with propagateExitStatus, and asserts
 * what lands on the consolation matchUp. Before the coercion fix the produced side read `WO` — a
 * walkover — for a pair of exits neither of which was one.
 */
it('carries a production code through propagation without relabelling it', () => {
  const idPrefix = 'matchUp';
  const drawId = 'production-codes';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix }],
    setState: true,
  });

  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT, matchUpStatusCodes: ['DD', 'DD'] },
    matchUpId: `${idPrefix}-1-1`,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 2, matchUpStatusCodes: ['DQ'] },
    propagateExitStatus: true,
    matchUpId: `${idPrefix}-1-2`,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId, inContext: true });
  const scored = matchUps?.find((m: any) => m.matchUpId === `${idPrefix}-1-2`);
  const consolation = matchUps?.find((m: any) => m.matchUpId === scored?.loserMatchUpId);

  // the authored production code survives verbatim
  expect(consolation?.matchUpStatusCodes).toContain('DQ');

  // and the side produced by the DOUBLE_DEFAULT upstream is recorded as a default, not a walkover
  expect(consolation?.matchUpStatusCodes).toEqual(['DEF', 'DQ']);
  expect(consolation?.matchUpStatusCodes).not.toContain(OUTCOME_WALKOVER);
});
