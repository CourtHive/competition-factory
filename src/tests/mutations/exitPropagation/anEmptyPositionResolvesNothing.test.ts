import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * AN EMPTY POSITION ADVANCING INTO A PENDING EXIT RESOLVES NOTHING.
 *
 * Census w2 9100079 (DE 16/13, propagation on), shrunk to four steps. `Main|1|5`'s walkover carries its loser into
 * `Backdraw|2|2` and on, past the BYE there, to `Backdraw|3|1`, where the walkover stands awarded to side 1. Side 1's
 * position (dp 4) is advanced into it structurally while still empty, ahead of the BYE that `Main|1|2`'s double
 * default then places on it. The generic advance treated that empty position as the walkover's winner and moved it
 * on into `Backdraw|4|1`, so the BYE landed there while the carrier who met it stayed behind
 * (BYE_ADVANCEMENT_MISSING). An empty position takes its seat and the exit stands (CA 2026-09-20; #5158 for the
 * arrival path); when the BYE arrives, the carrier passes it.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 13,
  seed: 9100079,
  drawSize: 16,
};
const steps = [
  at('Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'empty-position')).toBeNull();
});

it('the carrier passes the BYE, and the BYE does not advance', () => {
  const drawId = 'empty-position';
  setSubscriptions({});
  prepareDraw(config, drawId);
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

  const meeting = find('Backdraw|3|1');
  const carrier = meeting.sides.find((side: any) => side.participantId);
  // CONTROL: the shape is reached; the carrier holding the walkover meets a BYE
  expect(meeting.matchUpStatus).toEqual(BYE);
  expect(meeting.sides.find((side: any) => side.bye)?.drawPosition).toEqual(4);
  expect(meeting.sideExitProvenance?.[carrier.sideNumber]?.matchUpStatus).toEqual(WALKOVER);

  const onward = find('Backdraw|4|1');
  expect(onward.drawPositions).toContain(carrier.drawPosition);
  expect(onward.drawPositions).not.toContain(4);
  expect(onward.sides.some((side: any) => side.participantId === carrier.participantId)).toEqual(true);
  expect(onward.sides.some((side: any) => side.bye)).toEqual(false);
});
