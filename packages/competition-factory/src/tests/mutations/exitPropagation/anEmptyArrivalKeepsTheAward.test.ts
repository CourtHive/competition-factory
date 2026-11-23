import { observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * AN EMPTY POSITION ARRIVING AT AN EXIT ALREADY AWARDED LEAVES THE AWARD STANDING, SO TWO FIRST ENTRIES LEAVE THE SAME
 * DRAW IN EITHER ORDER (census run-17 baseline DRAW_INCONSISTENCY ADVANCED_ACROSS_LINK_FROM_UNDECIDED, COMPASS 16/15
 * seeds 20709099 and 20729822 and 32-draw siblings, `doubleExitPropagateBye: false`).
 *
 * `East|1|2`'s default sends its loser past `West|1|1`'s BYE into `West|2|1`, where their exit is awarded to the side
 * nobody has reached yet (RULE 2), and on as its loser into `Southwest|1|1`. `East|1|3`'s double default then sends the
 * empty position its produced exit leaves into that side. An empty position resolves nothing, and the matchUp kept its
 * status, but the placement cleared `winningSide`: `West|2|1` read undecided while its loser stood in `Southwest|1|1`.
 * In the other order the empty position is there first and the award is made beside it.
 */

const FIXTURE = path.join(__dirname, '../../fixtures/exitPropagation/anEmptyArrivalKeepsTheAward20709099.json');
const { config } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const DEFAULTED_EAST_1_2 = { at: 'East|1|2', outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 } };
const DOUBLE_EAST_1_3 = { at: 'East|1|3', outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(schedule: { at: string; outcome: any }[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, POLICY_OFF)).toBe(true);
  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  for (const { at, outcome } of schedule) {
    const target = matchUps().find((matchUp) => coordinate(matchUp) === at);
    const observed = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  // read before the next draw is prepared: preparing replaces engine state
  const names = new Map(matchUps().map((matchUp) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps().map((matchUp) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            {
              ...entry,
              sourceMatchUpId: names.get(entry?.sourceMatchUpId) ?? entry?.sourceMatchUpId,
              ...(entry?.byeClaims ? { byeClaims: entry.byeClaims.map((id: string) => names.get(id) ?? id) } : {}),
            },
          ]),
        ),
      },
    ]),
  );
}

it('the default then the double default leaves the draw the other order leaves', () => {
  expect(config.seed).toEqual(20709099);
  const defaultFirst = play([DEFAULTED_EAST_1_2, DOUBLE_EAST_1_3], 'empty-arrival-default-first');
  const doubleFirst = play([DOUBLE_EAST_1_3, DEFAULTED_EAST_1_2], 'empty-arrival-double-first');

  expect(defaultFirst['West|2|1'].matchUpStatus).toEqual('DEFAULTED');
  expect(defaultFirst['West|2|1'].winningSide).toEqual(2);
  expect(defaultFirst).toEqual(doubleFirst);
});
