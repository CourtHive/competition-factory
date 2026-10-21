import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RESULT PAST A CONVERGENCE'S BYE FIXES THE KIND (census S8 on arm, COMPASS 32/27, 21027128, STRUCTURAL_INVARIANT
 * UNDECIDED_WITH_SCORE, shrunk from 30 steps to 11).
 *
 * `East|1|13`'s walkover and `East|1|14`'s default carry into `West|1|7`, where the two exits converge. The convergence
 * has nobody to lose, so it claims a BYE on `South|1|4`; that BYE passes on through `South|2|2`, and the participant
 * opposite it there reaches `South|3|1`, recorded RETIRED 6-3. Re-entering `East|1|13` as a bare win for the same
 * winner changes its kind, from an exit to a played result (P52). The guard looked for a recorded result where the
 * walkover's loser stands and where the convergence's produced exit went, found none, and accepted it. The
 * convergence dissolved, its BYE claim was withdrawn, and clearing the BYE took the participant back out of
 * `South|3|1`, which was left TO_BE_PLAYED holding its score.
 *
 * What a convergence decided includes the BYE it claimed for its loser seat, so a result recorded past that BYE is a
 * result on the loser's path, and the change of kind is refused over an untouched draw. With nothing recorded there,
 * the same correction is accepted and leaves the draw the played result entered directly leaves. A winner flip keeps
 * the kind, so it stays accepted over the same recorded result: only the change of kind is refused.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 21027128 };
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const PLAYED = ['East|1|13', { winningSide: 1 }] as Step;
const opening: Step[] = [
  ['East|1|14', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['East|1|7', { winningSide: 1 }],
  ['East|1|8', { winningSide: 2 }],
  ['East|1|9', { winningSide: 1 }],
];
const middle: Step[] = [
  ['East|1|10', { winningSide: 2 }],
  ['West|1|5', { winningSide: 2 }],
  ['West|1|4', { winningSide: 1 }],
];
const RECORDED: Step = ['South|3|1', RETIRED_6_3];
const converged: Step[] = [
  ...opening,
  ['East|1|13', { matchUpStatus: WALKOVER, winningSide: 2 }],
  middle[0],
  // a flip with no status keeps the walkover's kind
  ['East|1|13', { winningSide: 1 }],
  ...middle.slice(1),
];

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toEqual(true);
  let last: any;
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    last = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(last.thrown).toBeUndefined();
  }
  const issueTypes = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  const draw = Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        score: matchUp.score?.scoreStringSide1 || undefined,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
  return { draw, issueTypes, last };
}

it('the census schedule replays clean on the arm that reported it', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  setSubscriptions({});
  const steps = [...converged, RECORDED, PLAYED].map(([key, outcome]) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  });
  expect(replay(config, steps, 'convergence-bye-kind-replay')).toBeNull();
});

it('a result recorded past the BYE refuses the change of kind over an untouched draw', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const before = play([...converged, RECORDED], 'convergence-bye-kind-before');
  expect(before.draw['West|1|7'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(before.draw['South|2|2'].matchUpStatus).toEqual(BYE);
  expect(before.draw['South|3|1']).toMatchObject({ matchUpStatus: RETIRED, winningSide: 1, score: '6-3' });

  const refused = play([...converged, RECORDED, PLAYED], 'convergence-bye-kind-refused');
  expect(refused.last.error?.code).toEqual(CANNOT_CHANGE_OUTCOME.code);
  expect(refused.issueTypes).toEqual([]);
  expect(refused.draw).toEqual(before.draw);
});

it('with nothing recorded past the BYE the correction is accepted, as the played result entered directly', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const corrected = play([...converged, PLAYED], 'convergence-bye-kind-corrected');
  expect(corrected.last.error).toBeUndefined();
  expect(corrected.issueTypes).toEqual([]);
  expect(corrected.draw['West|1|7'].matchUpStatus).toEqual(DEFAULTED);
  expect(corrected.draw['South|2|2'].matchUpStatus).toEqual(DEFAULTED);

  const direct = play([...opening, PLAYED, ...middle], 'convergence-bye-kind-direct');
  expect(corrected.draw).toEqual(direct.draw);
});

it('a winner flip that keeps the kind is accepted over the same recorded result', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const flipped = play([...converged, RECORDED, ['East|1|13', { winningSide: 2 }]], 'convergence-bye-kind-flip');
  expect(flipped.last.error).toBeUndefined();
  expect(flipped.issueTypes).toEqual([]);
  expect(flipped.draw['East|1|13']).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 2 });
  expect(flipped.draw['West|1|7'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(flipped.draw['South|3|1']).toMatchObject({ matchUpStatus: RETIRED, winningSide: 1, score: '6-3' });
});
