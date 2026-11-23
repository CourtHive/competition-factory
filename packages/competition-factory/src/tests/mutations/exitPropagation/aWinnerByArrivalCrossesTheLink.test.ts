import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A WINNER BY ARRIVAL CROSSES THE LINK — census 20023278 (DOUBLE_ELIMINATION 8/8, forward play only).
 *
 * The Main semi-final's loser is defaulted into the Backdraw final, where the default stands pending. The last step,
 * `Backdraw|1|1`'s double default, relays a produced exit past a BYE; the Backdraw's remaining participant wins
 * `Backdraw|3|1` and then the Backdraw FINAL by arriving into the pending default. Arrivals advance within a structure
 * only, so the Backdraw champion was never seated in the Main final, and the undefeated finalist waited there alone.
 */

const DRAW_ID = 'winner-by-arrival-crosses';

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

it('census 20023278: the Backdraw champion who wins its final by arriving is seated in the Main final', () => {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 8,
    seed: 20023278,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);

  const steps: [string, any][] = [
    ['Main|1|3', { winningSide: 2 }],
    ['Main|1|4', { winningSide: 2 }],
    ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|1|1', { winningSide: 2 }],
    ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Backdraw|1|1', { matchUpStatus: DOUBLE_DEFAULT }],
  ];
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }

  const backdrawFinal = at('Backdraw|4|1');
  const champion = backdrawFinal.sides.find(
    (side: any) => side.sideNumber === backdrawFinal.winningSide,
  )?.participantId;
  expect(champion).toBeDefined();

  const mainFinal = at('Main|4|1');
  const finalists = mainFinal.sides.map((side: any) => side.participantId).filter(Boolean);
  expect(finalists).toContain(champion);
  expect(finalists.length).toEqual(2);
  expect(mainFinal.matchUpStatus).toEqual(TO_BE_PLAYED);

  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  expect(stalls).toEqual([]);
});
