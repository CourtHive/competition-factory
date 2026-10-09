import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A LEAVING OCCUPANT'S AWARD IS HELD OPEN FOR WHOEVER ARRIVES — census w2 9100572 (MODIFIED_FEED_IN_CHAMPIONSHIP
 * 16/16, `allowChangePropagation`), frozen window.
 *
 * `Main|1|7`'s walkover loser carries it through the consolation's BYEs to `Consolation|3|2`, where it waits, awarded
 * to the seat `2|3`'s winner will fill. `Main|1|5`'s retired loser arrives there through `2|3`, takes the walkover, and
 * goes on. Re-scoring `Main|1|5` as a double walkover removes them from the consolation. Their advancement out of
 * `2|3` was released, but `3|2` read as a DECIDED matchUp — the walkover they had been awarded — and kept their seat;
 * the BYE for their vacated position was then placed at that furthest advancement, in `3|2`, in front of `2|3`'s
 * remaining occupant, who could not advance (BYE_ADVANCEMENT_MISSING).
 *
 * The loser is LEAVING (`removeDirectedLoser`), so an exit awarded to their seat is held open, as it is for any
 * occupant who leaves: `3|2` is the pending walkover again, and `2|3`'s occupant comes through to it. Entered without
 * the retirement, the draw is the same.
 */

const DRAW_ID = 'leaving-occupants-award-held-open';
const CONFIG = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 16,
  seed: 9100572,
  drawSize: 16,
};

const at = (key: string): any =>
  getDrawMatchUps(DRAW_ID).find(
    (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}` === key,
  );

function play(steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
  }
  const consolation = getDrawMatchUps(DRAW_ID)
    .filter((matchUp: any) => matchUp.structureName === 'Consolation')
    .map(({ roundNumber, roundPosition, matchUpStatus, winningSide, sides }: any) => ({
      key: `${roundNumber}|${roundPosition}`,
      participants: (sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      matchUpStatus,
      winningSide,
    }))
    .sort((a: any, b: any) => a.key.localeCompare(b.key));
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  return { consolation, issues };
}

const RETIREMENT = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const BEFORE: [string, any][] = [
  ['Main|1|8', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|1|3', RETIREMENT],
  ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

it('the loser who took a carried walkover leaves, and the walkover waits for whoever comes through', () => {
  const direct = play([...BEFORE, ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }]]);
  const corrected = play([...BEFORE, ['Main|1|5', RETIREMENT], ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }]]);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
  // `2|3`'s occupant came through to `3|2`, carrying their own walkover: the two carried exits converge there
  const seat = (key: string) => corrected.consolation.find((matchUp) => matchUp.key === key);
  expect(seat('3|2')?.participants.filter((participantId) => participantId && participantId !== 'BYE')).toHaveLength(2);
  expect(seat('3|2')?.matchUpStatus).toEqual(DOUBLE_WALKOVER);
});
