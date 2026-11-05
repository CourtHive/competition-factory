// constants and types
import type { PositionAssignment } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * Whether a single exit may be AWARDED to its `winningSide`.
 *
 * The waiver this serves lets a one-sided exit through, and it has to, because the cascade writes
 * exactly that shape: `progressExitStatus` RULE 2 awards a carried exit to the side WITHOUT the
 * exit, and that side is empty until the opponent arrives. An "the winner must hold a participant"
 * rule would forbid the engine's own output.
 *
 * So the question is not whether the winning side is empty. It is **which kind of empty**:
 *
 *  - an UNFILLED FEED SLOT carries no `drawPosition` at all. Nobody is there yet and nobody is
 *    claimed to be. This is the pending-exit shape, and it is legitimate — measured across the
 *    sequences `propagatedByeYieldsToArrivingLoser` pins, where a director re-scores a double exit
 *    down to a single walkover before the opposing feed has arrived.
 *  - a PHANTOM carries a `drawPosition` whose `positionAssignment` exists and holds nobody. The
 *    matchUp is claiming a seat that is empty. Measured at sweep seed 9000140 step 29: a Consolation
 *    matchUp with `drawPositions [19, 20]`, side 1 holding position 19 whose assignment was vacant,
 *    was recorded `WALKOVER winningSide: 1` and ACCEPTED — a walkover won by nobody, with
 *    `getDrawInconsistencies` reporting `valid`.
 *  - a BYE is NOT an occupant for this purpose. See below.
 *
 * The consistency argument is what settles the phantom case. At the SAME matchUp three steps
 * earlier, a bare `{ winningSide: 1 }` was already refused with ERR_INVALID_MATCHUP_STATUS, because
 * a directing outcome requires assigned participants. The waiver was letting an exit status do what
 * a plain result could not, on the same slot, in the same draw.
 *
 * ## A BYE can never be the winning side, and this is not a new rule
 *
 * #4858 allowed it, on the stated grounds that whether a player can lose a walkover to an opponent
 * who does not exist is a rules question for a governing body. **That was wrong, and the engine had
 * already answered it in two places:**
 *
 *  - `getExitWinningSide`: *"A BYE draw position can never be the winning side […] this guard exists
 *    so a future caller that forgets to filter cannot resurrect the 'advance the empty/BYE side'
 *    bug class."* It is a named invariant guarding a named bug class.
 *  - `progressExitStatus` RULE 1: when the opponent is a BYE the participant *advances through it* —
 *    "the BYE cascade has already moved them forward […] **NOT a WALKOVER**" — and the exit is
 *    re-propagated onto wherever they landed.
 *
 * CA, 2026-09-13, independently and before being shown either: *"A player that encounters a BYE gets
 * advanced; a player being advanced by a WALKOVER hits a BYE and continues advancing […] if they are
 * propagating their WALKOVER status all the way through then their WALKOVER occurs AFTER their
 * fall-through position is advanced by the BYE."* That is RULE 1 restated.
 *
 * So the propagation path never produces this state. Only a DIRECT entry could, and now cannot.
 *
 * The #4858 rationale also claimed "three committed tests construct that state on purpose". It is
 * ONE row of one test, and incidentally: `carriedExitProvenance`'s MODIFIED_FEED_IN_CHAMPIONSHIP
 * 8/6 case used `roundPosition: 1`, which in a 6-of-8 draw happens to be the BYE matchUp. Its
 * sibling row (FEED_IN_CHAMPIONSHIP 8/8, `roundPosition: 3`) has no byes at all. The row now targets
 * a contested matchUp, which is what it always meant to.
 *
 * A QUALIFIER placeholder is still accepted: it is a seat reserved for a participant who will be
 * named, not a structural absence, and nothing here measured it. Deliberately left alone.
 *
 * Only meaningful where exactly one side holds a participant; the caller establishes that.
 */
export function exitAwardable({
  positionAssignments,
  inContextMatchUp,
  winningSide,
}: {
  positionAssignments?: PositionAssignment[];
  inContextMatchUp?: HydratedMatchUp;
  winningSide?: number;
}): boolean {
  const winnerSide = (inContextMatchUp?.sides ?? []).find((side) => side?.sideNumber === winningSide);

  /**
   * Not to the participant who is ALREADY THERE. Exactly one side holds a participant, so awarding it
   * the exit is a walkover over an opponent nobody knows yet. The engine has no reading of that: the
   * pending-exit arrival path (`assignMatchUpDrawPosition`, `advancedExitWinningSide`) makes whoever
   * ARRIVES the winner, because the designed pending exit is the other one — the present participant
   * withdrew and the empty side wins. Accepted, it produced two winners of one matchUp, both advanced,
   * and the entered winner never reached the loser structure: a two-step DROPPED_PROGRESSION on
   * DOUBLE_ELIMINATION (census 9100555 and 9301605, shrunk). With `propagateExitStatus` off the same
   * entry was always refused. CA, 2026-09-17: refuse it.
   *
   * The OTHER direction is the one a director records before the opponent arrives (CA, 2026-10-04): the
   * participant already there walks over or is defaulted, and the EMPTY side is awarded — accepted with or
   * without `propagateExitStatus`, and offered by `matchUpActions` as `EXIT`. This refuses only the reverse.
   *
   * Nor against a BYE. A matchUp containing a BYE cannot have a winningSide — the BYE always
   * advances its opponent (CA, 2026-09-17). A walkover entered BEFORE a BYE arrives is a different
   * thing: the player and their walkover are advanced through the BYE and the exit occurs where they
   * land (`progressExitStatus` RULE 1), never on the BYE matchUp itself.
   */
  if (winnerSide?.participantId) return false;

  // a BYE is deliberately NOT in this list — see the docblock
  if (winnerSide?.qualifier) return true;
  if (winnerSide?.bye) return false;

  // no drawPosition claimed: an unfilled feed slot, awaiting its arrival
  if (winnerSide?.drawPosition === undefined) return true;

  const assignment = positionAssignments?.find((entry) => entry.drawPosition === winnerSide.drawPosition);
  // an assignment that does not exist is not a phantom either — nothing is being claimed
  if (!assignment) return true;

  // a BYE assignment is refused for the same reason a BYE side is
  if (assignment.bye) return false;

  return !!(assignment.participantId || assignment.qualifier);
}
