import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_ROUND_LOSER_CONSOLATION, DOUBLE_ELIMINATION, COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A WITHDRAWN EXIT TAKES ITS SIDE'S CODE WITH IT.
 *
 * Three frozen-census seeds failing `EXIT_CODE_ON_WINNER_SIDE`, one shape. Two double exits converge on one matchUp,
 * which holds a code on each side (`['DEF', 'DEF']`). One origin is then re-scored as a played match: its exit is
 * withdrawn, its winner arrives on that side, and the matchUp re-derives to the OTHER side's single exit, won by the
 * newcomer. `withdrawFromMatchUp` rightly does not rewrite the positional array wholesale, but nothing blanked the
 * withdrawn side's slot either, so the newcomer's side kept the old exit's code: a reason badge beside the winner.
 * Each case is the census seed shrunk to its fewest steps, replayed through the census's own `replay`.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const double = (matchUpStatus: string) => ({ matchUpStatus });

const CASES = [
  {
    name: 'FRLC 32/32 w1 9000276',
    config: { drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 32, participantsCount: 32, seed: 9000276 },
    propagateExitStatus: true,
    converged: 'Main|2|8',
    steps: [
      at('Main|1|16', double(DOUBLE_DEFAULT)),
      at('Main|1|15', double(DOUBLE_WALKOVER)),
      at('Main|1|15', double(DOUBLE_DEFAULT)),
      at('Main|1|15', { winningSide: 1 }),
    ],
  },
  {
    name: 'COMPASS 16/14 w1 9000517 (propagation off)',
    config: { drawType: COMPASS, drawSize: 16, participantsCount: 14, seed: 9000517 },
    propagateExitStatus: false,
    converged: 'East|2|2',
    steps: [
      at('East|1|4', double(DOUBLE_DEFAULT)),
      at('East|1|3', double(DOUBLE_WALKOVER)),
      at('East|1|3', double(DOUBLE_DEFAULT)),
      at('East|1|3', { winningSide: 2 }),
    ],
  },
  {
    name: 'DE 8/8 w2 9100184',
    config: { drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 8, seed: 9100184 },
    propagateExitStatus: true,
    converged: 'Main|3|1',
    steps: [
      at('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|1|4', { winningSide: 1 }),
      at('Main|2|2', double(DOUBLE_DEFAULT)),
      at('Main|1|1', double(DOUBLE_WALKOVER)),
      at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|1|2', double(DOUBLE_WALKOVER)),
      at('Main|2|2', { winningSide: 2 }),
    ],
  },
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it.each(CASES)('$name: the census replay holds every property', ({ config, propagateExitStatus, steps }) => {
  setSubscriptions({});
  expect(replay({ ...config, propagateExitStatus }, steps, 'code-replay')).toBeNull();
});

it.each(CASES)('$name: no code stands on the winning side', ({ config, propagateExitStatus, steps, converged }) => {
  const drawId = 'code-side';
  setSubscriptions({});
  prepareDraw({ ...config, propagateExitStatus }, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of steps) {
    const target = find(key(step));
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const matchUp = find(converged);
  // CONTROL: the shape is reached, a single exit won by the side whose exit was withdrawn
  expect([WALKOVER, DEFAULTED]).toContain(matchUp.matchUpStatus);
  expect(matchUp.winningSide).toBeDefined();
  const codes = matchUp.matchUpStatusCodes ?? [];
  const codeOn = (sideNumber: number) => {
    const code = codes[sideNumber - 1];
    return typeof code === 'string' ? code : code?.code;
  };
  expect(codeOn(matchUp.winningSide) || undefined).toBeUndefined();
  expect(codeOn(3 - matchUp.winningSide)).toBeDefined();
});
