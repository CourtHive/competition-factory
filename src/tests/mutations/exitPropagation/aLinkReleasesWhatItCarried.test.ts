import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';

/**
 * A PARTICIPANT WHO STOPS WINNING A LINK'S SOURCE ROUND COMES BACK OUT OF ITS TARGET.
 *
 * The DOUBLE_ELIMINATION grand-final family: nine frozen-census seeds failing `ERR_EXISTING_POSITION_ASSIGNMENT`
 * after mutating, traced to four release paths that stopped at the `Backdraw --WINNER--> Main` link
 * (`Mentat/planning/EXIT_CASCADE_DE_GRAND_FINAL_AND_SIDE_KEY_DESIGN.md` § 3; CA chose the build, 2026-10-05). The
 * rule is the published one: no drawPosition crosses a link, a link moves a participant, so whatever it carried
 * belongs to the participant and comes back when they stop being the source round's winner.
 *
 * Each case below is a census seed shrunk to the fewest steps that still failed, replayed through the census's
 * own `replay` (every per-step property, then the integrity check). Each fails on `dev` without its mode's fix.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (structureName: string, roundNumber: number, roundPosition: number, outcome: any): Step => ({
  structureName,
  roundNumber,
  roundPosition,
  outcome,
});
const config = (seed: number, participantsCount: number, propagateExitStatus: boolean) => ({
  drawType: DOUBLE_ELIMINATION,
  participantsCount,
  propagateExitStatus,
  drawSize: 8,
  seed,
});

const CASES: { mode: string; config: any; steps: Step[] }[] = [
  {
    // the grand final was decided by a produced exit awarded to the Backdraw champion's seat; a re-score in the
    // Backdraw semifinal changed the champion and the release skipped the decided grand final
    mode: 'A: the target round was decided by a produced exit (de 9303011)',
    config: config(9303011, 4, false),
    steps: [
      at('Main', 2, 2, { winningSide: 1 }),
      at('Main', 2, 1, { winningSide: 2 }),
      at('Main', 3, 1, { matchUpStatus: DOUBLE_DEFAULT }),
      at('Backdraw', 3, 1, { winningSide: 2 }),
      at('Backdraw', 3, 1, { winningSide: 1 }),
      at('Main', 3, 1, { winningSide: 2 }),
    ],
  },
  {
    // a withdrawn carry released the finalist inside the Backdraw and stopped at the link
    mode: 'B: a structure-local release did not follow the link (de 9304690)',
    config: config(9304690, 5, true),
    steps: [
      at('Main', 1, 3, { matchUpStatus: 'WALKOVER', winningSide: 1 }),
      at('Main', 2, 1, { matchUpStatus: 'DOUBLE_WALKOVER' }),
      at('Main', 2, 2, { matchUpStatus: 'WALKOVER', winningSide: 2 }),
      at('Main', 2, 2, { winningSide: 1 }),
      at('Backdraw', 3, 1, { winningSide: 1 }),
    ],
  },
  {
    // the Backdraw FINAL was un-decided; the withdrawal released from the round after it, which is across the link
    mode: 'C: the withdrawn matchUp was the link source round itself (de 9304168)',
    config: config(9304168, 4, true),
    steps: [
      at('Main', 2, 2, { matchUpStatus: 'WALKOVER', winningSide: 1 }),
      at('Main', 2, 1, { winningSide: 2 }),
      at('Main', 3, 1, { matchUpStatus: 'WALKOVER', winningSide: 2 }),
      at('Main', 3, 1, { winningSide: 1 }),
      at('Backdraw', 4, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ],
  },
  {
    // the finalist left the Backdraw with their seat keeping its BYE advancement, so no release ran at all
    mode: 'D: the participant left a structure through a seat that keeps its BYE advancement (de 9304251)',
    config: config(9304251, 4, false),
    steps: [
      at('Main', 2, 2, { matchUpStatus: DOUBLE_DEFAULT }),
      at('Main', 2, 1, { winningSide: 1 }),
      at('Main', 2, 1, { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } }),
      at('Main', 2, 2, { matchUpStatus: 'WALKOVER', winningSide: 1 }),
      at('Main', 2, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Backdraw', 3, 1, { winningSide: 2 }),
      at('Main', 3, 1, { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Backdraw', 4, 1, { winningSide: 1 }),
    ],
  },
];

describe('the grand-final family: each shrunk census seed replays clean', () => {
  it.each(CASES)('$mode', ({ config: cellConfig, steps }) => {
    setSubscriptions({});
    expect(replay(cellConfig, steps, `link-${cellConfig.seed}`)).toBeNull();
  });
});

/**
 * THE STATE NO DETECTOR SAW. In de 9303011's draw, CLEARING the Backdraw semifinal instead of re-scoring it left
 * the participant who no longer won anything in the grand final, winning it by default, and in the Decider; and
 * `getDrawInconsistencies` called the draw clean. Now they come back out of both, and the grand final's produced
 * exit stands pending: a produced exit has no winningSide until a participant arrives (CA, 2026-09-20).
 */
it('clearing the Backdraw semifinal takes its winner back out of the grand final and the Decider', () => {
  const drawId = 'link-clear';
  setSubscriptions({});
  const cellConfig = config(9303011, 4, false);
  prepareDraw(cellConfig, drawId);

  const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  const submit = (coordinate: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ matchUpId: find(coordinate).matchUpId, drawId, outcome });
  const occupants = (coordinate: string) =>
    (find(coordinate)?.sides ?? []).map((side: any) => side?.participantId).filter(Boolean);

  for (const [coordinate, outcome] of [
    ['Main|2|2', { winningSide: 1 }],
    ['Main|2|1', { winningSide: 2 }],
    ['Main|3|1', { matchUpStatus: DOUBLE_DEFAULT }],
    ['Backdraw|3|1', { winningSide: 2 }],
  ] as [string, any][]) {
    expect(submit(coordinate, outcome).success).toEqual(true);
  }

  // the precondition: the Backdraw champion went through the Backdraw final's BYE into the grand final, which
  // the Main final's double default had produced against their seat, and on into the Decider
  const champion = find('Backdraw|3|1').sides.find((side: any) => side.sideNumber === 2).participantId;
  expect(occupants('Main|4|1')).toEqual([champion]);
  expect(find('Main|4|1').matchUpStatus).toEqual(DEFAULTED);
  expect(occupants('Decider|1|1')).toContain(champion);

  const clear = { matchUpStatus: 'TO_BE_PLAYED', score: { scoreStringSide1: '', scoreStringSide2: '' } };
  expect(submit('Backdraw|3|1', clear).success).toEqual(true);

  expect(occupants('Main|4|1')).not.toContain(champion);
  expect(occupants('Decider|1|1')).not.toContain(champion);
  const grandFinal = find('Main|4|1');
  expect(grandFinal.matchUpStatus).toEqual(DEFAULTED);
  expect(grandFinal.winningSide).toBeUndefined();
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
