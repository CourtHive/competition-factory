import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { isDoubleExit } from '@Validators/isExit';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_ROUND_LOSER_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE STANDS WHEN THE CARRIER OF ONE OF ITS EXITS ADVANCES IN PAST A BYE.
 *
 * Two frozen-census seeds failing ORIGIN_ON_UNDECIDED_MATCHUP with PROPAGATED_EXIT_LOST, one shape. A double exit
 * produces an exit into one seat of a consolation matchUp. Then a participant who exited elsewhere, carrying their
 * exit, meets a BYE (another double exit's produced BYE) and is advanced through it, as a propagated exit meeting a
 * BYE is (CA, 2026-09-20). They arrive in the matchUp holding the produced exit: two exits on two sides, a
 * convergence, and nobody wins (RULE 4; #5161, "an arrival carrying an exit converges, never takes"). The BYE path's
 * generic advance wrote TO_BE_PLAYED over it, and the matchUp read undecided while its provenance recorded both
 * exits. Each case is the census seed shrunk to its fewest steps, replayed through the census's own `replay`.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const CASES = [
  {
    name: 'FRLC 32/30 w2 9100283',
    config: { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 32, participantsCount: 30, seed: 9100283 },
    converged: 'Consolation|2|3',
    steps: [
      at('Main|1|12', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Main|1|10', { winningSide: 1 }),
      at('Main|1|9', { winningSide: 2 }),
      at('Consolation|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|11', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
  },
  {
    name: 'DE 16/13 de 9301596',
    config: { drawType: DOUBLE_ELIMINATION, drawSize: 16, participantsCount: 13, seed: 9301596 },
    converged: 'Backdraw|3|1',
    steps: [
      at('Main|1|3', { winningSide: 2 }),
      at('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
    ],
  },
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it.each(CASES)('$name: the census replay holds every property', ({ config, steps }) => {
  setSubscriptions({});
  expect(replay({ ...config, propagateExitStatus: true }, steps, 'converge-replay')).toBeNull();
});

it.each(CASES)('$name: the matchUp is the double exit its provenance records', ({ config, steps, converged }) => {
  const drawId = 'converge';
  setSubscriptions({});
  prepareDraw({ ...config, propagateExitStatus: true }, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(key(step)).matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const matchUp = find(converged);
  // CONTROL: the shape is reached, an exit recorded on each side
  expect(Object.keys(matchUp.sideExitProvenance ?? {})).toHaveLength(2);
  expect(isDoubleExit(matchUp.matchUpStatus)).toEqual(true);
  expect(matchUp.winningSide).toBeUndefined();
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
