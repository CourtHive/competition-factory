import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

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

/**
 * The same arrival in a Backdraw — census de 9300487 (DOUBLE_ELIMINATION 16/13, `allowChangePropagation`), steps 0–17
 * of its frozen schedule, replayed as the census replays them: a step is taken only while its matchUp holds two
 * participants, and a refusal is part of the schedule. `Main|1|2`'s double walkover turns a Backdraw feeder into a
 * BYE, and the participant passing it lands on the side of `Backdraw|3|1` that DEFAULTED; resolving her as its winner
 * sent the defaulted side into `Backdraw|4|1` (WINNING_SIDE_ADVANCEMENT_MISMATCH).
 */
const DE_STEPS: [string, any][] = [
  ['Main|1|4', { winningSide: 2 }],
  ['Main|1|6', { winningSide: 1 }],
  ['Main|1|7', { winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|2|4', { winningSide: 2 }],
  ['Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 2 }],
  ['Main|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['Main|1|6', { winningSide: 1 }],
  ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|1|4', { winningSide: 1 }],
  ['Main|1|5', { winningSide: 2 }],
  ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Backdraw|1|2', { winningSide: 2 }],
  ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
];

it('census de 9300487: the defaulted side of a Backdraw matchUp is not advanced as its winner', () => {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 13,
    seed: 9300487,
    drawSize: 16,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of DE_STEPS) {
    const target = at(key);
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
  }
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).not.toContain('WINNING_SIDE_ADVANCEMENT_MISMATCH');

  const decided = at('Backdraw|3|1');
  expect(decided.matchUpStatus).toEqual(DEFAULTED);
  const winnerId = decided.sides.find((side: any) => side.sideNumber === decided.winningSide)?.participantId;
  const loserId = decided.sides.find((side: any) => side.sideNumber !== decided.winningSide)?.participantId;
  const onward = at('Backdraw|4|1').sides.map((side: any) => side.participantId);
  expect(onward).toContain(winnerId);
  expect(onward).not.toContain(loserId);
});
