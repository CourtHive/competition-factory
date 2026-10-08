import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * AN ARRIVAL ON THE EXITING SIDE TAKES NOTHING — census 20037222 (MODIFIED_FEED_IN_CHAMPIONSHIP 8/8).
 *
 * `Main|1|3` and `Main|1|4` are walkovers, so both of their losers reach `Consolation|1|2` carrying an exit: it converges
 * to a DOUBLE_WALKOVER and produces an exit onto `Consolation|2|2` side 2. `Main|2|1`'s loser arrives on side 1, is
 * awarded that walkover and plays on into `Consolation|3|1`. Then `Main|1|3` is corrected to a double walkover. Its loser
 * leaves `Consolation|1|2`, that seat becomes a BYE, and `Main|1|4`'s loser passes it — onto `Consolation|2|2` side 2,
 * the side the walkover was awarded AGAINST.
 *
 * The BYE path resolved that arrival as the empty winning slot of a pending exit and advanced her onward as its winner,
 * into the `Consolation|3|1` seat that `Consolation|2|1` owes. The participant `Consolation|2|1`'s BYE then sent there
 * found it taken and stayed behind; the draw stalled. She is that matchUp's loser: she carries her own exit past the BYE
 * (CA, 2026-10-02), and the walkover stands as it was awarded.
 *
 * Pinned against the rule, not against forward play: entering `Main|1|3`'s double walkover first leaves
 * `Consolation|2|2` TO_BE_PLAYED, because an exit carried past a BYE into a matchUp nobody has reached yet is not
 * written when the opponent arrives. That is a forward-play defect of its own (planning/STALLED_POSITION_AT_SCALE.md).
 */

const DRAW_ID = 'an-arrival-on-the-exiting-side';

const at = (key: string): any => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === Number(roundNumber) &&
        matchUp.roundPosition === Number(roundPosition),
    );
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 20037222,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const project = (key: string) => {
    const matchUp = at(key);
    return {
      participants: matchUp.sides.map((side: any) => side.participantId ?? null),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
    };
  };
  return {
    fed: project('Consolation|2|2'),
    onward: project('Consolation|3|1'),
    stalls: (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
      (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
    ).length,
  };
}

const LEAD: [string, any][] = [
  ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|1', { matchUpStatus: RETIRED, winningSide: 1 }],
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
];

it('the loser who passes the BYE is seated opposite the awarded winner, and nothing advances', () => {
  const corrected = play([
    ...LEAD,
    ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|1', { winningSide: 1 }],
    ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  const [awarded, arrived] = corrected.fed.participants;
  const byeHolder = at('Consolation|2|1').sides.find((side: any) => side.participantId)?.participantId;

  // she arrived carrying her own exit, so the walkover stands as it was awarded
  expect(arrived).toBeTruthy();
  expect(corrected.fed).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
  // `Consolation|3|1` holds the walkover's winner and `Consolation|2|1`'s, past its BYE — and not her
  expect(corrected.onward.participants).toEqual(expect.arrayContaining([awarded, byeHolder]));
  expect(corrected.onward.participants).not.toContain(arrived);
  expect(corrected.stalls).toEqual(0);
});
