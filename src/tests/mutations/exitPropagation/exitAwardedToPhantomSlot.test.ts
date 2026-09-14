import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A single exit may not be awarded to a PHANTOM slot — a drawPosition whose assignment holds nobody.
 *
 * `checkParticipants` waives the two-participant requirement for a one-sided exit, and it has to:
 * `progressExitStatus` RULE 2 awards a carried exit to the side WITHOUT the exit, and that side is
 * empty until the opponent arrives. A rule requiring the winner to hold a participant would forbid
 * the engine's own output.
 *
 * But the waiver tested `propagateExitStatus` — a REQUEST FLAG any caller can set — while its own
 * comment said it was for exits "caused by an exit propagation". So a directly-entered WALKOVER
 * could be awarded to a slot that was claimed and vacant, and the draw recorded a walkover won by
 * nobody. Measured 2026-09-13 at sweep seed 9000140 step 29: a Consolation matchUp with
 * `drawPositions [19, 20]`, side 1 holding position 19 whose `positionAssignment` was present and
 * empty, accepted `{ matchUpStatus: WALKOVER, winningSide: 1 }`. `getDrawInconsistencies` reported
 * `valid` throughout.
 *
 * ## The distinction, which is the whole of the fix
 *
 * The question is not whether the winning side is empty — the cascade's own output is. It is WHICH
 * KIND of empty:
 *
 * | shape | meaning | awardable |
 * |---|---|---|
 * | holds a participant, bye or qualifier | somebody is there | yes |
 * | no `drawPosition` at all | an unfilled feed slot, awaiting its arrival | yes |
 * | a `drawPosition` whose assignment is present and vacant | a seat claimed by nobody | **no** |
 *
 * The second row is not hypothetical: it is the state the sequences in
 * `propagatedByeYieldsToArrivingLoser.test.ts` construct, where a director re-scores a double exit
 * down to a single walkover before the opposing feed has arrived. An earlier and blunter version of
 * this rule — "the winner must hold a participant" — broke all of them, which is how the distinction
 * was found rather than assumed.
 *
 * ## Why this is a consistency fix rather than a new restriction
 *
 * At the SAME matchUp three steps earlier in that seed, a bare `{ winningSide: 1 }` was already
 * refused with `ERR_INVALID_MATCHUP_STATUS`, because a directing outcome requires assigned
 * participants. The waiver was letting an exit status do, on that slot, what a plain result could
 * not.
 *
 * A BYE on the winning side stays allowed, deliberately and narrowly. Whether a player can lose a
 * walkover to an opponent who does not exist is a rules question of the kind
 * `propagateRetirementAsExit` exists to stop the engine answering on its own, and three committed
 * tests construct that state on purpose. It is not decided here.
 */

const DRAW_ID = 'exit-phantom-slot';

/** Score one MAIN matchUp so that exactly one participant is fed into the consolation. */
function halfFilledConsolationMatchUp() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });

  const main = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) => matchUp.stage === 'MAIN' && matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
    );
  const scored: any = tournamentEngine.setMatchUpStatus({
    matchUpId: main.matchUpId,
    outcome: { winningSide: 1 },
    drawId: DRAW_ID,
  });
  expect(scored.error).toBeUndefined();

  const consolation = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.stage !== 'MAIN' && (matchUp.sides ?? []).filter((side: any) => side.participantId).length === 1,
    );
  // the control: the whole file is about a matchUp with exactly one occupant
  expect(consolation?.matchUpId, 'no half-filled consolation matchUp was produced').toBeDefined();

  const occupied = consolation.sides.find((side: any) => side.participantId);
  const emptySide = consolation.sides.find((side: any) => !side.participantId);
  // and the empty side must be a CLAIMED seat, not an unfilled feed slot — otherwise this is the
  // legitimate shape and the refusal below would be wrong
  expect(emptySide?.drawPosition, 'the empty side holds no drawPosition — not the phantom shape').toBeDefined();

  return { consolation, occupiedSideNumber: occupied.sideNumber, emptySideNumber: emptySide.sideNumber };
}

it.each([WALKOVER, DEFAULTED])('a %s cannot be awarded to a claimed-but-vacant slot', (matchUpStatus) => {
  const { consolation, emptySideNumber } = halfFilledConsolationMatchUp();

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: consolation.matchUpId,
    outcome: { matchUpStatus, winningSide: emptySideNumber },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);

  // ERROR_IMPLIES_NO_MUTATION: the refusal leaves the matchUp exactly as it was
  const after = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === consolation.matchUpId);
  expect(after.matchUpStatus).toEqual(consolation.matchUpStatus);
  expect(after.winningSide).toBeUndefined();
});

it.each([WALKOVER, DEFAULTED])('a %s IS still awarded to the participant who is there', (matchUpStatus) => {
  const { consolation, occupiedSideNumber } = halfFilledConsolationMatchUp();

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: consolation.matchUpId,
    outcome: { matchUpStatus, winningSide: occupiedSideNumber },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();

  const after = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === consolation.matchUpId);
  expect(after.matchUpStatus).toEqual(matchUpStatus);
  expect(after.winningSide).toEqual(occupiedSideNumber);
  // the winner is a real person, which is the point of the whole rule
  expect(after.sides.find((side: any) => side.sideNumber === after.winningSide)?.participantId).toBeDefined();
});

/**
 * The other direction of the gate: with `propagateExitStatus` OFF, the same call was ALREADY
 * refused. This pins that the fix did not silently change the flag's meaning — it removed a
 * divergence between the two, rather than creating a new one.
 */
it.each([WALKOVER, DEFAULTED])('a %s on a half-filled matchUp is refused without propagateExitStatus', (status) => {
  const { consolation, occupiedSideNumber } = halfFilledConsolationMatchUp();

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: consolation.matchUpId,
    outcome: { matchUpStatus: status, winningSide: occupiedSideNumber },
    propagateExitStatus: false,
    drawId: DRAW_ID,
  });
  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);
});

/**
 * A BYE CAN NEVER BE THE WINNING SIDE, and this test exists because #4858 allowed it.
 *
 * #4858's rationale was that whether a player can lose a walkover to an opponent who does not exist
 * is a rules question for a governing body, of the kind `propagateRetirementAsExit` exists to stop
 * the engine answering on its own. **That was wrong. The engine had already answered it**, in two
 * places, and the alternative it names is not a policy — it is a bug class:
 *
 *  - `getExitWinningSide`: *"A BYE draw position can never be the winning side. […] this guard
 *    exists so a future caller that forgets to filter cannot resurrect the 'advance the empty/BYE
 *    side' bug class."*
 *  - `progressExitStatus` RULE 1: when the opponent is a BYE the participant **advances through
 *    it** — *"the BYE cascade has already moved them forward […] NOT a WALKOVER"* — and the exit is
 *    re-propagated onto wherever they landed.
 *
 * CA, 2026-09-13, independently and before being shown either: *"A player that encounters a BYE gets
 * advanced; a player being advanced by a WALKOVER hits a BYE and continues advancing […] if they are
 * propagating their WALKOVER status all the way through then their WALKOVER occurs AFTER their
 * fall-through position is advanced by the BYE."*
 *
 * So the propagation path never produces this state; only a direct entry could. The second case
 * below is the one that matters most — it pins that the DEFENSIBLE half still works, so this is a
 * refusal of an impossible outcome rather than a ban on scoring a matchUp that contains a bye.
 */
const byeMatchUp = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    // 6 of 8 leaves two byes: MAIN r1p1 is `[participant, BYE]` and r1p4 is `[BYE, participant]`
    drawProfiles: [{ participantsCount: 6, drawSize: 8, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });

  const matchUp = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (candidate: any) => candidate.stage === 'MAIN' && candidate.roundNumber === 1 && candidate.roundPosition === 1,
    );

  const byeSide = matchUp.sides.find((side: any) => side.bye);
  const playerSide = matchUp.sides.find((side: any) => side.participantId);
  // the control: this really is a bye matchUp with exactly one real participant
  expect(byeSide?.sideNumber, 'MAIN r1p1 is not a BYE matchUp in this reduction').toBeDefined();
  expect(playerSide?.participantId).toBeDefined();

  return { matchUp, byeSideNumber: byeSide.sideNumber, playerSideNumber: playerSide.sideNumber };
};

it.each([WALKOVER, DEFAULTED])('a %s cannot be awarded to a BYE side', (matchUpStatus) => {
  const { matchUp, byeSideNumber } = byeMatchUp();

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome: { matchUpStatus, winningSide: byeSideNumber },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error).toEqual(INVALID_MATCHUP_STATUS);

  // and the refusal is atomic — the matchUp is still the BYE it was
  const after = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((candidate: any) => candidate.matchUpId === matchUp.matchUpId);
  expect(after.matchUpStatus).toEqual(matchUp.matchUpStatus);
  expect(after.winningSide).toBeUndefined();
});

/**
 * The half that must keep working. Refusing the bye as a WINNER must not become a refusal to record
 * anything on a matchUp that merely contains one — a director can still record that the present
 * player did not play, and the exit is theirs.
 */
it.each([WALKOVER, DEFAULTED])('a %s IS still accepted on a bye matchUp for the present player', (matchUpStatus) => {
  const { matchUp, playerSideNumber } = byeMatchUp();

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome: { matchUpStatus, winningSide: playerSideNumber },
    propagateExitStatus: true,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();

  const after = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((candidate: any) => candidate.matchUpId === matchUp.matchUpId);
  expect(after.winningSide).toEqual(playerSideNumber);
  expect(after.sides.find((side: any) => side.sideNumber === after.winningSide)?.participantId).toBeDefined();
});
