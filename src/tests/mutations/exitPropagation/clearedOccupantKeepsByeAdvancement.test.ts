import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A SEAT ADVANCED BY ITS OPPONENT'S BYE KEEPS THAT ADVANCEMENT WHEN ITS OCCUPANT IS CLEARED — P46.
 *
 * CA, 2026-10-01, on two tournament files generated identically (FIRST_MATCH_LOSER_CONSOLATION 8/5,
 * seed 7000118) and differing only in route — A the double walkover entered directly, B a walkover
 * entered and then corrected to the double walkover: *"A is clearly correct and the logic needs to
 * support the same result with the path described for B."*
 *
 * ## The defect it was written against
 *
 * `correctionDivergenceDeep`'s last 3 severe cells, all this shape:
 *
 *   - Seat 2 of the consolation is fed by `Main|2|2`'s loser and its opponent, seat 5, is a BYE, so the
 *     generated draw already has seat 2 in `Consolation|3|1`: `[2, _]`.
 *   - The WALKOVER's loser lands on seat 2 — already advanced — and `Consolation|3|1` reads `[2, 4]`.
 *   - The correction to a double exit clears that participant. `positionClear`'s round walk kept a
 *     BYE-advanced seat only when the thing withdrawn was a propagated BYE; a PARTICIPANT leaving took
 *     the advancement with it, `[_, 4]`, and the double exit's BYE then landed on seat 2 and advanced
 *     seat 5 into the hole: `[4, 5]`. Route A reads `[2, 4]`.
 *
 * With the policy off nothing lands on seat 2 after the correction, so route A keeps seat 2 in the
 * final and route B had lost it — the same removal, a different tenant.
 *
 * ## The rule, and what made it possible
 *
 * The advancement never depended on the occupant; it depended on the OPPONENT's BYE. The generated
 * draw is exactly this state — an advanced seat with nobody on it. The rule had been tried on
 * 2026-09-30 and broke 4 of `shuffleCompletion`'s byeLimit cases: `assignDrawPositionBye` on a seat
 * that was already advanced and alone found nothing to advance and skipped the loser feed.
 * `assignByeToLoserTarget` closes that, so the rule can be what it says.
 */

const played = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 3, winningSide: 1 },
      { side1Score: 6, side2Score: 3, winningSide: 1 },
    ],
  },
  winningSide: 1,
};
const walkover = { matchUpStatus: WALKOVER, winningSide: 1 };
const doubleWalkover = { matchUpStatus: DOUBLE_WALKOVER };

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function findByKey(drawId: string, target: string) {
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  return matchUps.find((matchUp) => key(matchUp) === target);
}

/** Play the prefix; when `correct` the WALKOVER is entered first and then corrected to the double exit. */
function play({ drawId, correct, doubleExitPropagateBye }: any) {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: {
      [POLICY_TYPE_PROGRESSION]: {
        ...(doubleExitPropagateBye === undefined ? {} : { doubleExitPropagateBye }),
        propagateExitStatus: false,
      },
    },
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 5, drawId }],
    nonRandom: 7000118,
  });
  tournamentEngine.setState(tournamentRecord);

  // CONTROL: the arrangement under test — seat 2's opponent is a BYE, so seat 2 is advanced from generation
  expect(findByKey(drawId, 'Consolation|3|1').drawPositions).toEqual([2]);

  const steps: [string, any][] = [
    ['Main|1|2', played],
    ['Main|2|1', played],
    ['Main|2|2', correct ? walkover : doubleWalkover],
  ];
  if (correct) steps.push(['Main|2|2', doubleWalkover]);

  for (const [target, outcome] of steps) {
    const { matchUpId } = findByKey(drawId, target);
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId, outcome, drawId });
    expect(result.success, `${target} ${JSON.stringify(outcome)}`).toEqual(true);
  }
}

const signature = (matchUp: any) => ({
  sides: (matchUp.sides ?? []).map((side: any) => (side.bye ? 'BYE' : (side.participantId ?? '-'))),
  drawPositions: matchUp.drawPositions,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

it.each([
  { label: 'a BYE', doubleExitPropagateBye: undefined },
  { label: 'an exit', doubleExitPropagateBye: false },
])(
  'keeps seat 2 advanced when the correction clears its occupant and the double exit produces $label',
  ({ doubleExitPropagateBye }) => {
    play({ drawId: 'corrected', correct: true, doubleExitPropagateBye });
    const corrected = findByKey('corrected', 'Consolation|3|1');

    // THE DEFECT: seat 5 — the assigned BYE — had advanced into the hole seat 2 left. Measured before
    // the fix: `[4, 5]` under the default policy, `[_, 4]` with the policy off.
    expect(corrected.drawPositions, "seat 2 keeps the advancement its opponent's BYE gave it").toContain(2);

    // THE INVARIANT: route B ends where route A ends.
    play({ drawId: 'direct', correct: false, doubleExitPropagateBye });
    const direct = findByKey('direct', 'Consolation|3|1');
    expect(signature(corrected)).toEqual(signature(direct));
  },
);
