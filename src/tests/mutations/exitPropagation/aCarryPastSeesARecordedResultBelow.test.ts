import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

// constants
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN ARRIVAL IS CARRIED PAST A SEAT DECIDED FOR IT WHEN A RECORDED RESULT STANDS BELOW — and the cascade can SEE that
 * result (census S4, F2 run 16, COMPASS 32/30 seed 20599089, shrunk from 30 steps to 12; arms `off` and `policyoff`).
 *
 * `East|1|13`'s walkover sent its loser into `West|1|7`, which a produced walkover decided for the empty seat (RULE 2).
 * A result was then recorded below it (`South|3|1`, among others). `East|1|14` DEFAULTED sends its loser into the awaited seat:
 * CA, 2026-10-11, the arrival is carried past — it takes the seat, advances to `West|2|4`, and carries its DEFAULTED
 * on from there — because a convergence would take back the result recorded below.
 *
 * `progressExitStatus` asked that question on a view built without the tournament record. The downstream walk reads
 * whether a match was played from `side.participant`, which only a hydrated view carries, so the recorded result read
 * as inert, the arrival was not carried, and the convergence it fell through to was refused by `setMatchUpState`
 * (which did see it) — returning ERR_INCOMPATIBLE_MATCHUP_STATUS after the arrival had been written.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/carryPastSeesARecordedResultBelow20599089.json');
const { config, steps } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const DRAW_ID = 'carry-past-sees-recorded-result';
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps ?? [];
const at = (key: string) => matchUps().find((matchUp) => coordinate(matchUp) === key);
const participantAt = (key: string, sideNumber: number) =>
  at(key)?.sides?.find((side: any) => side.sideNumber === sideNumber)?.participantId;

function play(step: any) {
  const target = at(`${step.structureName}|${step.roundNumber}|${step.roundPosition}`);
  return observeMutation({
    propagateExitStatus: config.propagateExitStatus,
    matchUpId: target.matchUpId,
    outcome: step.outcome,
    drawId: DRAW_ID,
  });
}

it('carries the defaulted arrival past West|1|7 and leaves the recorded South|3|1 standing', () => {
  setSubscriptions({});
  expect(prepareDraw(config, DRAW_ID)).toBe(true);
  for (const step of steps.slice(0, -1)) expect(play(step).error).toBeUndefined();

  const southFinal = JSON.stringify(at('South|3|1'));
  const arrival = participantAt('East|1|14', 2);

  const last: any = play(steps.at(-1));
  expect(last.error).toBeUndefined();

  // the decided seat stands, its walkover now won by the arrival
  expect(at('West|1|7')).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 2 });
  expect(participantAt('West|1|7', 2)).toEqual(arrival);
  // the arrival advanced and carried its own exit on from there (RULE 1 shape)
  expect(at('West|2|4')).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 2 });
  expect(participantAt('West|2|4', 1)).toEqual(arrival);
  expect(at('Southwest|1|2')).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(participantAt('Southwest|1|2', 2)).toEqual(arrival);
  // and the result recorded below is untouched
  expect(JSON.stringify(at('South|3|1'))).toEqual(southFinal);
});
