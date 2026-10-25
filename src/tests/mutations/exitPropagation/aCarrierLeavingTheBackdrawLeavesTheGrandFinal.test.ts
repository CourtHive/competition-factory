import { prepareDraw, replayFailure } from '@Tests/testHarness/exitPropagation/sweep';
import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A CARRIER TAKEN BACK OUT OF THE BACKDRAW FINAL LEAVES THE GRAND FINAL TOO, with the walkover it carried there
 * (Phase C closure gate, openings policy off, 2026-10-25: DOUBLE_ELIMINATION 8/4 seeds 21117689, 21124430, 21128630,
 * 21129654 and 21157227, each ERROR_IMPLIES_NO_MUTATION; and 21104021 under allow-change-propagation, DO_UNDO_IDENTITY).
 *
 * `Main|2|1` a double default, and `Main|2|2` a walkover: its loser carries the walkover into the Backdraw, through
 * it on the double default's produced exits, across the Backdraw final's winner link and into the grand final
 * (`Main|4|1`), where the Main side's arrival wins it by that walkover. Re-scoring `Main|2|1` to a walkover sends
 * its loser into the Backdraw to meet the carrier: a double walkover there, so the carrier stops in the Backdraw.
 * They were taken back out of the Backdraw final, and the release followed the link, but the grand final was
 * decided, so it kept them: a walkover won by its emptied seat, decided by nothing but the carry leaving with them.
 * The next Backdraw champion could not be seated there (`ERR_EXISTING_POSITION_ASSIGNMENT`); before #5760 the error
 * was dropped and the grand final stayed wrong, the carrier in the champion's place.
 *
 * A matchUp decided only by a carry that leaves with its carrier is released with it, whether the carrier leaves
 * because a BYE they passed was taken back or because they left the structure that sent them across the link, as
 * long as the award names a seat nobody holds (`releaseAdvancedDrawPosition`, `decidedByLeavingCarry`).
 */
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = (seed: number) => ({
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 4,
  drawSize: 8,
  seed,
});
const step = (at: string, outcome: Record<string, unknown>) => {
  const [structureName, roundNumber, roundPosition] = at.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

/** the five gate seeds, each shrunk by the harness's `shrink` to the four or five steps that fail */
const SHRUNK: [number, ReturnType<typeof step>[]][] = [
  [
    21117689,
    [
      step('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
      step('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      step('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
      step('Main|3|1', { winningSide: 1 }),
    ],
  ],
  [
    21124430,
    [
      step('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
      step('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
      step('Main|2|2', { winningSide: 1 }),
      step('Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ],
  ],
  [
    21128630,
    [
      step('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
      step('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
      step('Main|2|2', { winningSide: 1 }),
      step('Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
    ],
  ],
  [
    21129654,
    [
      step('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
      step('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
      step('Main|2|1', { winningSide: 2 }),
      step('Main|2|2', { winningSide: 1 }),
      step('Main|3|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    ],
  ],
  [
    21157227,
    [
      step('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
      step('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
      step('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
      step('Main|3|1', { winningSide: 2 }),
    ],
  ],
];

describe('the census replays them clean: no call returns an error after writing', () => {
  it.each(SHRUNK)('seed %s', (seed, steps) => {
    expect(replayFailure(config(seed), steps as any, `de-${seed}`)).toBeNull();
  });
});

/**
 * The same stranding seen through a correction probe (openings allow-change-propagation, 21104021, DO_UNDO_IDENTITY):
 * with the carrier left in the grand final, a double walkover entered on the Main final and cleared again did not
 * return the draw to where it stood; the Decider's seats came back swapped.
 */
it('allow-change-propagation: a correction probe on the Main final returns the draw to where it stood (21104021)', () => {
  const previous = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  try {
    const steps = [
      step('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
      step('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      step('Main|2|2', { winningSide: 1 }),
    ];
    expect(replayFailure(config(21104021), steps as any, 'de-21104021')).toBeNull();
  } finally {
    if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
    else process.env.ALLOW_CHANGE_PROPAGATION = previous;
  }
});

it('the grand final is emptied with the carrier, and then takes the Backdraw champion', () => {
  setSubscriptions({ subscriptions: {} });
  const drawId = 'carrier-leaves-the-grand-final';
  const seed = 21157227;
  expect(prepareDraw(config(seed), drawId)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const at = (where: string) => matchUps().find((matchUp) => coordinate(matchUp) === where);
  const play = ({ structureName, roundNumber, roundPosition, outcome }: ReturnType<typeof step>) => {
    const observed = observeMutation({
      matchUpId: at(`${structureName}|${roundNumber}|${roundPosition}`).matchUpId,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
    expect(observed.invariantViolations ?? []).toEqual([]);
  };
  const [doubleDefault, walkover, rescored, mainFinal] = SHRUNK[4][1];

  play(doubleDefault);
  play(walkover);
  // CONTROL: the carrier is in the grand final, and the walkover they carried decides it
  const carrier = at('Main|2|2').sides[1].participantId;
  expect(at('Main|4|1').sides.map((side: any) => side.participantId)).toContain(carrier);
  expect(at('Main|4|1').matchUpStatus).toEqual(WALKOVER);

  play(rescored);
  expect(at('Backdraw|3|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  const grandFinal = at('Main|4|1');
  expect(grandFinal.sides.some((side: any) => side.participantId)).toEqual(false);
  expect(grandFinal.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(grandFinal.winningSide).toBeUndefined();

  play(mainFinal);
  expect(at('Main|3|1').matchUpStatus).toEqual(COMPLETED);
  const mainFinalWinner = at('Main|3|1').sides[1].participantId;
  const backdrawFinal = at('Backdraw|4|1');
  const backdrawChampion = backdrawFinal.sides[backdrawFinal.winningSide - 1].participantId;
  expect(
    at('Main|4|1')
      .sides.map((side: any) => side.participantId)
      .sort(),
  ).toEqual([mainFinalWinner, backdrawChampion].sort());
  expect(at('Main|4|1').sides.map((side: any) => side.participantId)).not.toContain(carrier);
});
