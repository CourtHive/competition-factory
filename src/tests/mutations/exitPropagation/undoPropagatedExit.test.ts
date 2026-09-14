import { getDrawDefinition, projectDraw, stableHash } from '@Tests/testHarness/exitPropagation/transitions';
import { POLICY_SCORING_USTA } from '@Fixtures/policies/POLICY_SCORING_USTA';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DEFAULTED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CLEAR_SCORE } from '@Constants/matchUpActionConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';

/**
 * An exit a matchUp PRODUCED must come back when that matchUp's own result is removed.
 *
 * CA's ruling, 2026-09-13: *"A retiree is out of a MATCH but not out of the EVENT unless the
 * governing policy says so."* The policy half of that shipped as `propagateRetirementAsExit`. This
 * is the other half — a TD who enters a retirement under a policy that propagates it must be able
 * to un-enter it.
 *
 * ## The defect, as measured rather than as described
 *
 * The prompt that opened this work called it a retirement defect in 4 draw types. Measured at
 * `dev` 2026-09-13 it is **all three single-exit statuses in 5 loser-linked draw types**: the apply
 * succeeded in 15 of 15 cells and the clear was refused in 15 of 15 with
 * `ERR_PROPAGATED_EXITS_DOWNSTREAM`. A WALKOVER and a DEFAULTED were refused exactly as a RETIRED
 * was. The retirement is only how a TD *reaches* it — a TD enters retirements, and rarely un-enters
 * a walkover.
 *
 * ## Why the predicate change alone was the wrong fix
 *
 * `hasPropagatedExitDownstream` asks its question with `isExit(status)`, and the obvious repair is
 * to make it a provenance question so a matchUp does not refuse on account of an exit it produced
 * itself. Doing only that permits the clear in all 15 cells **and leaves residue in all 15** — the
 * consolation matchUp keeps its WALKOVER, its `winningSide` and its provenance, and
 * `getDrawInconsistencies` reports nothing. **The refusal was load-bearing**: it stood in for an
 * unwind the engine could not perform. `withdrawProducedExits` is that unwind; the predicate change
 * is scoped to exactly what it takes back.
 *
 * ## The oracle here is the ROUND TRIP, not the error code
 *
 * `expect(result.error).toBeUndefined()` says only that the engine agreed to try. These cases assert
 * that the draw returns to the state it held before the outcome was entered, projected through the
 * same `projectDraw` the property harness uses — which includes `matchUpStatus`, `winningSide`,
 * `drawPositions`, `matchUpStatusCodes` and `sideExitProvenance`. That is what "undoable" means to a
 * tournament director, and it is the assertion the old refusal made untestable: `checkDoUndoIdentity`
 * excuses a refused clear, so a clear that was WRONGLY refused was invisible to the harness.
 */

const DRAW_TYPES = [
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  COMPASS,
];

const EXIT_STATUSES = [RETIRED, WALKOVER, DEFAULTED];

const CLEAR = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

const outcomeFor = (matchUpStatus: string) => ({
  matchUpStatus,
  winningSide: 1,
  score:
    matchUpStatus === RETIRED
      ? { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' }
      : { scoreStringSide1: '', scoreStringSide2: '' },
});

function firstRoundMatchUp(drawId: string) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
}

const actionTypes = (drawId: string, matchUpId: string): string[] =>
  (tournamentEngine.matchUpActions({ matchUpId, drawId })?.validActions ?? []).map((action: any) => action.type);

const carriedExits = (drawId: string, sourceStructureId: string) =>
  tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.filter((matchUp: any) => matchUp.structureId !== sourceStructureId && matchUp.sideExitProvenance);

describe.each(DRAW_TYPES)('%s', (drawType) => {
  it.each(EXIT_STATUSES)('a propagated %s is undoable, and the undo restores the draw', (status) => {
    setSubscriptions({});
    const drawId = `undo-${drawType}-${status}`;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType, drawId }],
      nonRandom: 1,
      setState: true,
    });

    const source = firstRoundMatchUp(drawId);
    expect(source?.matchUpId).toBeDefined();
    const before = stableHash(projectDraw(getDrawDefinition(drawId)));

    const applied: any = tournamentEngine.setMatchUpStatus({
      matchUpId: source.matchUpId,
      propagateRetirementAsExit: true,
      propagateExitStatus: true,
      outcome: outcomeFor(status),
      drawId,
    });
    expect(applied.error).toBeUndefined();

    // the control: without a carried exit this case is about nothing, and would pass just as well
    // if propagation had silently stopped working
    expect(
      carriedExits(drawId, source.structureId).length,
      `${drawType}/${status}: nothing propagated`,
    ).toBeGreaterThan(0);

    // the affordance advertises the clear before the clear is attempted — `matchUpActions` and
    // `setMatchUpStatus` consult the same predicate, and this is the pairing that keeps them agreeing
    expect(actionTypes(drawId, source.matchUpId)).toContain(CLEAR_SCORE);

    const cleared: any = tournamentEngine.setMatchUpStatus({
      matchUpId: source.matchUpId,
      propagateRetirementAsExit: true,
      propagateExitStatus: true,
      outcome: CLEAR,
      drawId,
    });
    expect(cleared.error, `${drawType}/${status}: the clear was refused`).toBeUndefined();

    // the exits it produced went with it
    expect(carriedExits(drawId, source.structureId)).toEqual([]);

    // and the draw is byte-identical to before the outcome was entered
    const after = stableHash(projectDraw(getDrawDefinition(drawId)));
    expect(after, `${drawType}/${status}: the clear left residue`).toEqual(before);

    const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
    expect(integrity?.valid).not.toEqual(false);
  });
});

/**
 * The POLICY route, which is where a real tournament meets this.
 *
 * Every case above passes `propagateExitStatus` and `propagateRetirementAsExit` as PARAMS. A
 * tournament sets neither: it attaches a scoring policy, and `POLICY_SCORING_USTA` turns both on.
 * The same gap existed for `propagateRetirementAsExit` itself when it shipped — the param path was
 * covered and the policy path was not — so it is closed here rather than assumed to follow.
 */
it('a retirement entered under POLICY_SCORING_USTA can be un-entered', () => {
  setSubscriptions({});
  const drawId = 'undo-usta-policy';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 1,
    setState: true,
  });
  tournamentEngine.attachPolicies({ policyDefinitions: POLICY_SCORING_USTA });

  const source = firstRoundMatchUp(drawId);
  const before = stableHash(projectDraw(getDrawDefinition(drawId)));

  // no propagation params — everything comes from the attached policy
  const applied: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    outcome: outcomeFor(RETIRED),
    drawId,
  });
  expect(applied.error).toBeUndefined();

  // the control: the POLICY, not a param, is what carried the retirement onward. If this is empty
  // the test below proves nothing about undoing a propagated exit.
  const carried = carriedExits(drawId, source.structureId);
  expect(carried.length, 'the USTA policy did not propagate the retirement').toBeGreaterThan(0);
  expect(carried[0].matchUpStatus).toEqual(WALKOVER);

  const cleared: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    outcome: CLEAR,
    drawId,
  });
  expect(cleared.error).toBeUndefined();
  expect(stableHash(projectDraw(getDrawDefinition(drawId)))).toEqual(before);
});
