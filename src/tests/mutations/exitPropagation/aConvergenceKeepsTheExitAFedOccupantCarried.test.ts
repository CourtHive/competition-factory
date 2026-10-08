import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE KEEPS THE EXIT A FED OCCUPANT CARRIED — census 20035463 (FEED_IN_CHAMPIONSHIP 8/5, forward play).
 *
 * The loser of `Main|2|2`, walked over, is fed into `Consolation|2|1`, passes its BYE, and sits in `Consolation|3|1`
 * carrying the WALKOVER. A DOUBLE_WALKOVER at `Consolation|2|2` then converges there, and nobody wins it. The
 * convergence stamps provenance as a pair, the other side taken from the PAIRED PREVIOUS matchUp — `Consolation|2|1`,
 * a BYE — which replaced the occupant's carried exit with `{ BYE }`. With the exit erased, `STALLED_POSITION` read a
 * player who had exited as stranded (CA, 2026-09-29: an occupant who exited is not waiting).
 */

const DRAW_ID = 'convergence-keeps-carry';

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

it('census 20035463: the walked-over occupant keeps their exit when a double walkover converges on them', () => {
  setSubscriptions({});
  const config = {
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: true,
    participantsCount: 5,
    seed: 20035463,
    drawSize: 8,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);

  const steps: [string, any][] = [
    ['Main|2|1', { winningSide: 2 }],
    ['Main|1|3', { winningSide: 1 }],
    ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|3|1', { winningSide: 1 }],
    ['Consolation|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
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

  const walkedOver = at('Main|2|2').sides.find((side: any) => side.sideNumber === 2).participantId;
  const convergence = at('Consolation|3|1');
  const occupantSide = convergence.sides.find((side: any) => side.participantId === walkedOver);
  expect(convergence.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(occupantSide).toBeDefined();

  const raw = getDrawDefinition(DRAW_ID)
    .structures.flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === convergence.matchUpId);
  expect(raw.sideExitProvenance[occupantSide.sideNumber]).toMatchObject({
    sourceMatchUpId: at('Main|2|2').matchUpId,
    matchUpStatus: WALKOVER,
  });

  const stalls = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).filter(
    (inconsistency: any) => inconsistency.issueType === STALLED_POSITION,
  );
  expect(stalls).toEqual([]);
});
