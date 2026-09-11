import { getStructureInconsistencies } from '@Query/drawDefinition/getStructureInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  ROUND_ROBIN,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';

// CI-style engine-consistency regression guard.
//
// Runs getStructureInconsistencies over a broad matrix of freshly generated, fully
// completed draws — every supported draw type × sizes 8/16/32/64 — each seeded with a
// mix of exit outcomes (WALKOVER / DEFAULTED / RETIRED / DOUBLE_WALKOVER) in round 1 so
// exit propagation is exercised, not just clean scores. The engine must produce zero
// structural inconsistencies for every combination; a failure here means either the
// checker regressed (false positive) or the generators produced a genuinely inconsistent
// draw (the exact drift class this checker exists to catch).
//
// Round 1 always has >= 4 matchUps for drawSize >= 8, so the same fixed exit set applies
// to every size. Injected at generation time (drawProfiles.outcomes) then filled by
// completeAllMatchUps, guaranteeing a consistent completed draw with real exits in it.
const R1_EXIT_OUTCOMES = [
  { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
  { roundNumber: 1, roundPosition: 2, matchUpStatus: WALKOVER, winningSide: 1 },
  { roundNumber: 1, roundPosition: 3, matchUpStatus: DEFAULTED, winningSide: 2 },
  {
    roundNumber: 1,
    roundPosition: 4,
    matchUpStatus: RETIRED,
    winningSide: 1,
    score: { sets: [{ side1Score: 6, side2Score: 3 }] },
  },
];

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
];
const DRAW_SIZES = [8, 16, 32, 64];

const MATRIX = DRAW_TYPES.flatMap((drawType) => DRAW_SIZES.map((drawSize) => [drawType, drawSize] as const));

test.for(MATRIX)('CI sweep: %s drawSize %d completes with zero structural inconsistencies', ([drawType, drawSize]) => {
  setSubscriptions({});
  const drawId = `ci-${drawType}-${drawSize}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize, drawType, outcomes: R1_EXIT_OUTCOMES }],
    completeAllMatchUps: true,
    setState: true,
  });
  // guard the test's own construction — a matrix cell that fails to generate is a test bug,
  // not an engine inconsistency; surface it loudly rather than silently passing.
  expect(drawIds).toContain(drawId);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const result: any = getStructureInconsistencies({ drawDefinition });
  if (!result.valid) {
    // include the offending inconsistencies in the failure message for fast triage
    expect(JSON.stringify(result.inconsistencies, null, 2)).toEqual('[]');
  }
  expect(result.valid).toEqual(true);
});
