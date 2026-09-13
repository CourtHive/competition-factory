import { getDrawDefinition, projectDraw, stableHash } from '@Tests/testHarness/exitPropagation/transitions';
import { POLICY_SCORING_USTA } from '@Fixtures/policies/POLICY_SCORING_USTA';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

/**
 * The tournament director who entered a score backwards.
 *
 * CA's scenario, 2026-09-13: *"tournament director entered a score backwards and didn't catch it
 * until the next day — they go to enter a score and see the wrong participant progressed."*
 *
 * `changeWinningSide.test.ts` already covers the mechanism well: a COMPASS draw with all 72 matchUps
 * completed, the first matchUp's `winningSide` flipped, and the correction asserted to reach the
 * West final. What it does not cover is what this file adds, and each gap is one a real deployment
 * would hit before the covered path does.
 */

const RETIREMENT = {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
};

function completedDraw({ drawId, drawType, drawSize }: any) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, drawId }],
    completeAllMatchUps: true,
    setState: true,
  });
}

const firstMatchUpOf = (drawId: string, structureName: string) =>
  tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureName === structureName && matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
    );

/**
 * 1. THE POLICY ROUTE.
 *
 * Both existing tests pass `allowChangePropagation` as a PARAM. `setMatchUpStatus` also resolves it
 * from the scoring policy — `POLICY_SCORING_DEFAULT` sets it `false` — and that path had no test at
 * all. It is the same gap that existed for `propagateRetirementAsExit` when it shipped: the param
 * path covered, the policy path assumed to follow. A deployment sets a policy once; it does not pass
 * a flag on every call.
 */
it('allowChangePropagation is honoured from POLICY, not only from params', () => {
  const drawId = 'change-propagation-policy';
  completedDraw({ drawId, drawType: COMPASS, drawSize: 32 });

  const first = firstMatchUpOf(drawId, 'East');
  expect(first?.matchUpId).toBeDefined();
  const flipped = first.winningSide === 1 ? 2 : 1;

  // the control, and the reason the assertion below is about the policy: with no policy and no
  // param, the identical call is refused
  const refused: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    outcome: { winningSide: flipped },
    drawId,
  });
  expect(refused.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_SCORING]: { policyName: 'corrections', allowChangePropagation: true } },
  });

  // no param — the permission comes entirely from the attached policy
  const accepted: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    outcome: { winningSide: flipped },
    drawId,
  });
  expect(accepted.error).toBeUndefined();

  const corrected = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === first.matchUpId);
  expect(corrected.winningSide).toEqual(flipped);
});

/**
 * 2. THE ROUND TRIP — the TD who corrects, then realises they were right the first time.
 *
 * A correction that propagates through eight structures is only half of the story; the other half is
 * whether it can be taken back. The existing tests flip once and assert the far end moved. Neither
 * flips back, so a correction that propagates forward but not symmetrically would pass both.
 *
 * The oracle is the whole projected draw, not the one matchUp that was flipped — including
 * `matchUpStatusCodes` and `sideExitProvenance`, so a correction that leaves residue anywhere in the
 * cascade is caught rather than only one that leaves the wrong winner at the final.
 *
 * **What a round trip CANNOT see: a SYMMETRIC defect.** Flipping and flipping back applies the same
 * transformation twice, so any corruption that is its own inverse cancels. Verified by intervention
 * rather than asserted: narrowing `swapWinnerLoser`'s subsequent-matchUp rewrite to
 * `roundNumber > matchUpRoundNumber + 1` — skipping the immediate next round entirely — leaves BOTH
 * cases here green, and leaves both cases in `changeWinningSide.test.ts` green too. The third case
 * in this file is what goes red.
 *
 * That is the same structural blindness `doubleExitStatusParity` has, for the same reason, and it is
 * recorded here so the next reader does not mistake this for a residue detector. It proves
 * REVERSIBILITY, which nothing tested before; it does not prove correctness of the correction.
 */
it.each([
  { drawType: COMPASS, drawSize: 32, structureName: 'East' },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, structureName: 'Main' },
])('a correction to $drawType can be corrected BACK, and the draw returns', ({ drawType, drawSize, structureName }) => {
  const drawId = `change-round-trip-${drawType}`;
  completedDraw({ drawId, drawType, drawSize });

  const first = firstMatchUpOf(drawId, structureName);
  expect(first?.matchUpId).toBeDefined();
  const original = first.winningSide;
  const flipped = original === 1 ? 2 : 1;

  const before = stableHash(projectDraw(getDrawDefinition(drawId)));

  const out: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    allowChangePropagation: true,
    outcome: { winningSide: flipped },
    drawId,
  });
  expect(out.error).toBeUndefined();

  // the control: the flip must actually have CHANGED the draw, or the identity below holds trivially
  const middle = stableHash(projectDraw(getDrawDefinition(drawId)));
  expect(middle, `${drawType}: flipping the winningSide changed nothing`).not.toEqual(before);

  const back: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    allowChangePropagation: true,
    outcome: { winningSide: original },
    drawId,
  });
  expect(back.error).toBeUndefined();

  expect(stableHash(projectDraw(getDrawDefinition(drawId))), `${drawType}: the correction did not round-trip`).toEqual(
    before,
  );
});

/**
 * 3. A BACKWARDS SCORE WHOSE STATUS IS AN EXIT.
 *
 * The covered path corrects a COMPLETED result. A retirement entered against the wrong player is the
 * shape a TD is most likely to produce — the retiring player is the one who is not there to object —
 * and under a policy that propagates retirements it also writes a WALKOVER into a consolation
 * matchUp. Correcting it therefore has to move an exit as well as a winner.
 *
 * Run under `POLICY_SCORING_USTA`, which sets `propagateExitStatus` and `propagateRetirementAsExit`
 * together, so the correction is exercised where the retirement actually carries.
 */
it('a retirement entered against the wrong player can be corrected, and the carried exit follows', () => {
  const drawId = 'change-retirement-backwards';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 1,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      [POLICY_TYPE_SCORING]: { ...POLICY_SCORING_USTA[POLICY_TYPE_SCORING], allowChangePropagation: true },
    },
  });

  const source = firstMatchUpOf(drawId, 'Main');
  const sideOne = source.sides.find((side: any) => side.sideNumber === 1)?.participantId;
  const sideTwo = source.sides.find((side: any) => side.sideNumber === 2)?.participantId;
  expect(sideOne && sideTwo).toBeTruthy();

  // entered backwards: side 1 is recorded as the winner, so side 2 is the retiree
  const applied: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    outcome: RETIREMENT,
    drawId,
  });
  expect(applied.error).toBeUndefined();

  const carriedFor = (participantId: string) =>
    tournamentEngine
      .allDrawMatchUps({ inContext: true, drawId })
      .matchUps.find(
        (matchUp: any) =>
          matchUp.structureId !== source.structureId &&
          matchUp.matchUpStatus === WALKOVER &&
          matchUp.sides?.some((side: any) => side.participantId === participantId),
      );

  // the control: the wrong player is the one carrying the walkover into the consolation
  expect(carriedFor(sideTwo), 'the retirement did not carry into the consolation').toBeDefined();
  expect(carriedFor(sideOne)).toBeUndefined();

  // the correction, the next day
  const corrected: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    outcome: { ...RETIREMENT, winningSide: 2 },
    drawId,
  });
  expect(corrected.error).toBeUndefined();

  const after = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === source.matchUpId);
  expect(after.winningSide).toEqual(2);
  expect(after.matchUpStatus).toEqual(RETIRED);

  // the exit moved with the correction: the player wrongly recorded as retiring is no longer the one
  // carrying a walkover into the consolation, and the player who actually retired now is
  expect(carriedFor(sideOne), 'the corrected retiree is not carrying the exit').toBeDefined();
  expect(carriedFor(sideTwo), 'the exit stayed with the player who did not retire').toBeUndefined();

  const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(integrity?.valid).not.toEqual(false);
});
