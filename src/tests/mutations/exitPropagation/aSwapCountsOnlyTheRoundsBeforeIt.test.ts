import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL } from '@Constants/outcomePipelineConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A SWAP COUNTS ONLY THE ROUNDS BEFORE IT (census w1 9000582, FIRST_MATCH_LOSER_CONSOLATION 8/4, and nine more FMLC seeds,
 * `allowChangePropagation`; found by the S0 census replay under `differential`, triaged 2026-10-23).
 *
 * A first-match-loser feed takes a loser only if the match they lost was their first played. Every player here had
 * a first-round BYE, so a second-round match is everyone's first. `Main|2|1` was won by side 2, who then won
 * `Main|3|1` too; the swap makes side 1 the winner. A swap rewrites the advancing drawPosition in every LATER
 * matchUp, so the new loser loses those later wins with it, and `Main|2|1` was their first match: they go to the
 * consolation. v1 counts the rounds before the flipped one (`reconcileFedLoserEligibility`); v2 counted every other
 * matchUp of the structure, read the later win as still theirs, and planned them out. v2 now counts as v1 does, on
 * the swap route, where the rule applies.
 */
type Step = [string, any];
const config = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 4,
  drawSize: 8,
  seed: 9000582,
};
const steps: Step[] = [
  ['Main|2|2', { winningSide: 1 }],
  ['Main|2|1', { winningSide: 2 }],
  ['Main|2|2', { winningSide: 2 }],
  ['Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|3|1', { winningSide: 2 }],
  ['Main|3|1', { winningSide: 1 }],
];
const SWAP: Step = ['Main|2|1', { winningSide: 1 }];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const enter = (drawId: string, [key, outcome]: Step) =>
  observeMutation({ propagateExitStatus: true, matchUpId: find(drawId, key).matchUpId, outcome, drawId });
const sideIn = (matchUp: any, sideNumber: number) =>
  matchUp?.sides?.find((side: any) => side?.sideNumber === sideNumber)?.participantId;

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

it('the census schedule replays clean on the arm that reported it', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  setSubscriptions({});
  const schedule = [...steps, SWAP].map(([key, outcome]) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  });
  expect(replay(config, schedule, 'swap-rounds-before-replay')).toBeNull();
});

it('the new loser of a swapped first match goes to the consolation, with v2 agreeing', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  setSubscriptions({});
  const drawId = 'swap-rounds-before';
  expect(prepareDraw(config, drawId)).toEqual(true);
  // CONTROL: both sides of Main|2|1 came through a first-round BYE, so this match is their first
  const firstRound = getDrawMatchUps(drawId).filter((m: any) => m.structureName === 'Main' && m.roundNumber === 1);
  for (const step of steps) expect(enter(drawId, step).thrown).toBeUndefined();
  const before = find(drawId, 'Main|2|1');
  const [winnerBefore, loserBefore] = [sideIn(before, 2), sideIn(before, 1)];
  for (const participantId of [winnerBefore, loserBefore])
    expect(
      firstRound.some(
        (m: any) => m.matchUpStatus === 'BYE' && m.sides?.some((s: any) => s?.participantId === participantId),
      ),
    ).toEqual(true);
  // CONTROL: the side about to lose won a later round too, which is what the old count read as still theirs
  expect([sideIn(find(drawId, 'Main|3|1'), 1), sideIn(find(drawId, 'Main|3|1'), 2)]).toContain(winnerBefore);

  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  const swapped = enter(drawId, SWAP);
  expect(swapped.thrown, 'v2 and v1 disagree').toBeUndefined();
  expect(swapped.error).toBeUndefined();

  const consolationOccupants = getDrawMatchUps(drawId)
    .filter((m: any) => m.structureName === 'Consolation')
    .flatMap((m: any) => (m.sides ?? []).map((s: any) => s?.participantId))
    .filter(Boolean);
  expect(consolationOccupants).toContain(winnerBefore);
  expect(consolationOccupants).not.toContain(loserBefore);
});
