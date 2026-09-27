import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * **A DOUBLE_WALKOVER IN MAIN ROUND 2 LEAVES ITS CONNECTED FEED SEAT AS A BYE.**
 *
 * CA, 2026-09-27, naming the shape: *"It would be a DOUBLE_WALKOVER in a main second round that feeds a
 * connected structure's 2nd round."*
 *
 * A double walkover produces no loser, so the seat its loser would have been fed into can never fill.
 * The participant waiting opposite that seat must not be stranded — the seat resolves as a BYE and the
 * participant advances.
 *
 * ## Why this test exists, and what it is NOT evidence of
 *
 * It was written to answer CA asking why nothing pinned this. Measuring first changed what the test
 * should say, twice:
 *
 * 1. **The behaviour is already correct**, on `dev` at `9c732e033`, with no source change. So this is a
 *    PIN of existing behaviour and must not be read as evidence for any fix.
 * 2. **It is NOT `doubleExitPropagateBye`.** Measured both ways: the BYE lands identically with the
 *    policy attached and with no policy at all. This is the ordinary consolation-BYE cascade, and the
 *    policy is irrelevant to it — which is why the test asserts both arms rather than attaching a policy
 *    and assuming it mattered.
 *
 * It is also not exercising `propagateUnfillableLoserBye`. That function never fires in this scenario —
 * instrumented and measured — and across the whole suite it fires 43 times, every one at round 1.
 *
 * ## The shape, `FEED_IN_CHAMPIONSHIP` 16
 *
 * Main round 1 losers feed `Consolation` round 1; Main round 2 losers feed `Consolation` round 2, which
 * is a FEED round of a CONNECTED structure — the exact shape CA named. The feed mapping is not the
 * identity: the double walkover at `Main|2|1` targets `Consolation|2|4`, which is why this test locates
 * the affected matchUp by its EMPTY FED SEAT rather than by assuming a roundPosition.
 */

const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: true } };

type Setup = { consolationRound2: any[]; drawId: string; target: any };

function playToMainRound2({ policyOn, drawId }: { policyOn: boolean; drawId: string }): Setup {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType: FEED_IN_CHAMPIONSHIP, drawSize: 16, participantsCount: 16 }],
    ...(policyOn ? { policyDefinitions: POLICY } : {}),
    nonRandom: 11,
    setState: true,
  });

  const all = () => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps as any[];
  const inRound = (structureName: string, roundNumber: number) =>
    all().filter((matchUp: any) => matchUp.structureName === structureName && matchUp.roundNumber === roundNumber);

  // Main round 1, then Consolation round 1, so a real participant is WAITING in each Consolation round 2
  // matchUp. Without that the seat opposite is empty too and nothing is stranded yet.
  for (const round of [
    { structureName: 'Main', scoreString: '6-1 6-1', roundNumber: 1 },
    { structureName: 'Consolation', scoreString: '6-2 6-2', roundNumber: 1 },
  ]) {
    for (const matchUp of inRound(round.structureName, round.roundNumber)) {
      const { outcome } = mocksEngine.generateOutcomeFromScoreString({
        scoreString: round.scoreString,
        winningSide: 1,
      });
      const result = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome, drawId });
      expect(result.error).toBeUndefined();
    }
  }

  return { consolationRound2: inRound('Consolation', 2), drawId, target: inRound('Main', 2)[0] };
}

const seatOf = (matchUp: any, drawPosition: number) =>
  (matchUp.sides ?? []).find((side: any) => side?.drawPosition === drawPosition);

it.each([
  ['with doubleExitPropagateBye attached', true],
  ['with no policy at all', false],
])('a Main round 2 double walkover leaves its connected feed seat a BYE, %s', (_label, policyOn) => {
  const { consolationRound2, drawId, target } = playToMainRound2({ policyOn, drawId: `fed-bye-${policyOn}` });

  // CONTROLS. Every assertion below is about a transition, so the BEFORE state has to be shown — a test
  // that only checked the end state would pass just as well if the seat had been a BYE all along.
  expect(consolationRound2.length).toBe(4);
  for (const matchUp of consolationRound2) {
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    // exactly one occupant and one EMPTY fed seat: fillable-looking, and about to stop being fillable
    expect((matchUp.sides ?? []).filter((side: any) => side?.participantId).length).toBe(1);
    expect((matchUp.sides ?? []).filter((side: any) => side?.bye).length).toBe(0);
  }
  expect(target.matchUpStatus).not.toEqual(DOUBLE_WALKOVER);

  const before = new Map(
    consolationRound2.map((matchUp: any) => [
      matchUp.matchUpId,
      (matchUp.sides ?? []).find((side: any) => side?.participantId),
    ]),
  );

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    drawId,
  });
  expect(result.error).toBeUndefined();

  const after = (tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps as any[]).filter(
    (matchUp: any) => matchUp.structureName === 'Consolation' && matchUp.roundNumber === 2,
  );
  const resolved = after.filter((matchUp: any) => matchUp.matchUpStatus === BYE);

  // EXACTLY ONE seat resolves, and it is the one the double walkover's loser would have travelled to.
  // A cascade that scattered BYEs across the round would satisfy "a BYE appeared" and be wrong.
  expect(resolved.length).toBe(1);

  const [byeMatchUp] = resolved;
  const occupant = before.get(byeMatchUp.matchUpId);
  const byeSide = (byeMatchUp.sides ?? []).find((side: any) => side?.bye);

  // the BYE takes the seat that could never fill — the FED position, not the occupant's
  expect(byeSide).toBeDefined();
  expect(byeSide.drawPosition).not.toEqual(occupant.drawPosition);

  // and the waiting participant is still there, on the same drawPosition, rather than displaced
  expect(seatOf(byeMatchUp, occupant.drawPosition)?.participantId).toEqual(occupant.participantId);

  // A BYE IS NEVER WON. The seat resolving is not the match being decided.
  expect(byeMatchUp.winningSide).toBeUndefined();

  // the other three are untouched — still TO_BE_PLAYED with their single occupant
  for (const matchUp of after.filter((candidate: any) => candidate.matchUpId !== byeMatchUp.matchUpId)) {
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect((matchUp.sides ?? []).filter((side: any) => side?.bye).length).toBe(0);
  }

  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
