import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A PARTICIPANT ARRIVING THROUGH A BYE TAKES THE PENDING EXIT OPPOSITE — census 20076731 (DOUBLE_ELIMINATION 8/7,
 * `doubleExitPropagateBye: false`), forward play only.
 *
 * `Main|1|3`'s double walkover produces a WALKOVER into `Backdraw|1|1`, which `Main|1|4`'s retired loser then wins.
 * `Main|1|2`'s double default carries a DEFAULTED past `Backdraw|2|2`'s BYE into `Backdraw|3|1`, where the empty seat
 * advanced ahead of it already stands on the exiting side. The walkover winner then comes through `Backdraw|2|1`'s BYE
 * on the other side: they win the pending DEFAULTED and go on (`progressExitStatus` RULE 2). They were placed and the
 * matchUp written TO_BE_PLAYED over the exit (PROPAGATED_EXIT_LOST); a result in the Main semifinal then left the
 * Backdraw final and the Main final waiting on nobody.
 */

const DRAW_ID = 'arrival-through-a-bye-takes-the-pending-exit';

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

const retired = (winningSide: number) => ({
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
  matchUpStatus: RETIRED,
  winningSide,
});

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 7,
    seed: 20076731,
    drawSize: 8,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const semifinal = at('Backdraw|3|1');
  const winner = semifinal.sides?.find((side: any) => side.sideNumber === semifinal.winningSide);
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    backdrawFinalHoldsWinner: !!at('Backdraw|4|1').sides?.some(
      (side: any) => winner?.participantId && side.participantId === winner.participantId,
    ),
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    winnerIsParticipant: !!winner?.participantId,
    matchUpStatus: semifinal.matchUpStatus,
  };
}

const FIRST_ROUND: [string, any][] = [
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', retired(1)],
  ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
];

it('the walkover winner coming through the BYE wins the pending DEFAULTED and goes on', () => {
  const result = play(FIRST_ROUND);
  expect(result).toMatchObject({ matchUpStatus: DEFAULTED, winnerIsParticipant: true, backdrawFinalHoldsWinner: true });
  expect(result.issues).toEqual([]);
});

it('census 20076731: a result in the Main semifinal leaves nobody waiting', () => {
  const result = play([...FIRST_ROUND, ['Main|3|1', retired(1)]]);
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});
