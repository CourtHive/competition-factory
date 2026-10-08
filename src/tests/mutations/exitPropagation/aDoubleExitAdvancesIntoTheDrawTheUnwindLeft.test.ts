import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

/**
 * A DOUBLE EXIT ADVANCES INTO THE DRAW THE UNWIND LEFT — `doubleExitPropagateBye: false`.
 *
 * When a result becomes a double exit, what the previous result directed is taken back first — `removeDoubleExit` for
 * a double exit re-entered as the other one, `removeDirectedParticipants` for a decided result — and the advancement
 * then writes into the same targets. They were read before the removal. Census w2 9100380 (MODIFIED_FEED_IN_CHAMPIONSHIP
 * 8/5): `Main|2|1`'s DOUBLE_DEFAULT re-entered as a DOUBLE_WALKOVER withdrew the BYE it had placed on its fed
 * consolation seat, and the advancement, still reading that seat as a BYE, stamped an exit beside it instead of placing
 * the BYE again. The matchUp read BYE with nobody and no BYE in the seat; the consolation stalled.
 */

const DRAW_ID = 'double-exit-unwind-reread';
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

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

const stalls = () =>
  (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  ).length;

function replay(config: any, steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(config, DRAW_ID, POLICY_OFF)).toEqual(true);
  // as the census replays a schedule: a step is taken only while its matchUp holds two participants
  for (const [key, outcome] of steps) {
    const target = at(key);
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      propagateExitStatus: config.propagateExitStatus,
      drawId: DRAW_ID,
      outcome,
    });
  }
}

const FMLC = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 6,
  drawSize: 8,
};

const MFIC = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: false,
  participantsCount: 5,
  seed: 9100380,
  drawSize: 8,
};

it('census w2 9100380: a fed seat the re-entered double exit owes is a BYE again', () => {
  replay(MFIC, [
    ['Main|2|1', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|1|3', { winningSide: 1 }],
    [
      'Main|2|2',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Consolation|3|1', { winningSide: 2 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|2|2', { winningSide: 1 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|2|2', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|2|2', { winningSide: 1 }],
    [
      'Main|2|1',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|1|3', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Consolation|3|1', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|1|3', { winningSide: 1 }],
    ['Consolation|3|1', { winningSide: 1 }],
    ['Main|2|2', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|2|1', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
    ['Consolation|3|1', { winningSide: 2 }],
    ['Main|1|3', { winningSide: 2 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|2|1', { winningSide: 1 }],
    ['Consolation|3|1', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|2|1', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    ['Consolation|3|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|2|1', { matchUpStatus: 'DOUBLE_WALKOVER' }],
  ]);
  const fed = at('Consolation|2|2');
  expect(fed.matchUpStatus).toEqual(BYE);
  expect(fed.sides.some((side: any) => side.bye)).toEqual(true);
  expect(stalls()).toEqual(0);
});

/**
 * The same on the other route — census w1 9000252 (FIRST_MATCH_LOSER_CONSOLATION 8/6): `Main|2|2` decided, then made a
 * DOUBLE_WALKOVER. `removeDirectedParticipants` takes back the reservation BYE its decided loser left on
 * `Consolation|2|2`'s fed seat, and the advancement, reading the seat as a BYE still, stamped an exit there.
 */
it('census w1 9000252: a decided result made a double exit advances into the draw its removal left', () => {
  replay({ ...FMLC, seed: 9000252 }, [
    [
      'Main|1|3',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|1|3', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    ['Main|2|2', { winningSide: 2 }],
    ['Main|2|2', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|2', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
    ['Main|1|3', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
    ['Main|2|1', { winningSide: 1 }],
    ['Consolation|2|1', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|1|2', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|1|3', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Consolation|2|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|2|2', { winningSide: 2 }],
    [
      'Consolation|2|2',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|1|3', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 1 }],
    ['Consolation|2|2', { winningSide: 1 }],
    ['Consolation|2|2', { winningSide: 1 }],
    ['Main|3|1', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|3|1', { winningSide: 1 }],
  ]);
  const fed = at('Consolation|2|2');
  // the seat holds a participant or a BYE, and the matchUp does not read BYE over two participants
  expect(fed.sides.filter((side: any) => side.participantId || side.bye).length).toEqual(2);
  expect(fed.matchUpStatus === BYE).toEqual(fed.sides.some((side: any) => side.bye));
  expect(stalls()).toEqual(0);
});

/**
 * A produced exit carried over a LOSER link — only with the policy off — and somebody standing opposite it — census w2
 * 9100572 (MODIFIED_FEED_IN_CHAMPIONSHIP 16/16). `Consolation|1|1` converged `Main|1|1`'s carried walkover with
 * `Main|1|2`'s produced one; relabelling `Main|1|1` as played re-derived it to the produced exit alone, awarded to the
 * relabelled loser standing there. `settleRederivedDoubleExit` left an exit that arrived over a loser link as
 * re-derived — right where nobody stands, and here it left the winner unadvanced (WINNER_NOT_ADVANCED). Forward play
 * advances them.
 */
it('census w2 9100572: the participant awarded a re-derived produced exit goes on', () => {
  replay({ ...MFIC, participantsCount: 16, propagateExitStatus: true, seed: 9100572, drawSize: 16 }, [
    ['Main|1|4', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['Main|1|8', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|7', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
    [
      'Main|1|7',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|1|2', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|6', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|1', { matchUpStatus: 'WALKOVER', winningSide: 2 }],
    ['Main|1|4', { winningSide: 1 }],
    [
      'Main|1|3',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|2|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
    ['Main|1|3', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|1|4', { winningSide: 2 }],
    ['Main|1|5', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    [
      'Main|1|5',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|1|5', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|7', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    ['Main|1|7', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    ['Main|3|1', { winningSide: 2 }],
    ['Main|1|7', { winningSide: 1 }],
    ['Main|3|1', { winningSide: 1 }],
    ['Main|1|4', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['Main|4|1', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    [
      'Main|1|5',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
    ['Main|4|1', { matchUpStatus: 'DEFAULTED', winningSide: 1 }],
    ['Main|2|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
    ['Main|1|4', { winningSide: 1 }],
    ['Main|1|8', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['Main|1|1', { winningSide: 2 }],
    ['Consolation|1|2', { winningSide: 1 }],
  ]);
  const awarded = at('Consolation|1|1');
  const winnerId = awarded.sides.find((side: any) => side.sideNumber === awarded.winningSide)?.participantId;
  expect(winnerId).toBeTruthy();
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).not.toContain('WINNER_NOT_ADVANCED');
  expect(stalls()).toEqual(0);
});
