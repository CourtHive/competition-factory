import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT ARRIVING AT A SEAT ALREADY DECIDED FOR IT IS CARRIED PAST (census F2, P51 group 2; CA, 2026-10-11).
 *
 * OLYMPIC 16/16, `allowChangePropagation`, census seed 20496362. Italo walks over in `East|1|7` and carries the
 * walkover into `West|1|4`, which is decided for the seat still awaiting its second participant (RULE 2). His loss
 * there sends him on to `South|1|2`, where Uhura is awarded his walkover, and Uhura then beats Nicole in `South|2|1`:
 * a result somebody recorded.
 *
 * Then America walks over in `East|1|8` and arrives at `West|1|4` carrying a walkover of her own. RULE 4 would
 * converge the two into a double exit, taking back the award below and the result recorded on from it, so it was
 * refused, after the draw had been written (`ERR_INCOMPATIBLE_MATCHUP_STATUS`). CA: *"a participant carrying an exit
 * into an exit that was awaiting the 2nd participant ... carry it past makes sense."* America takes the seat that was
 * awaiting her, advances, and carries her walkover on from `West|2|2`; `West|1|4` and the South results stand.
 *
 * Behind it, the P52 rule (`correctionKindChange`) missed that recorded result. Relabelling `East|1|7`'s walkover as a
 * played win withdraws Italo's carry, which takes back Uhura's award, and Uhura was left in the recorded `South|2|1`
 * over an undecided `South|1|2`. The result recorded by the winner of the loser's carried award, one structure on,
 * blocks a change of kind exactly as one recorded where the loser stands does: refused, over an untouched draw.
 *
 * Falsified: without `carryPastDecidedMatchUp` the walkover is refused after writing; without `carryPlayedOn` the
 * relabel is accepted and leaves Uhura advanced from an undecided matchUp.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 16, drawSize: 16, seed: 20496362 };
type Step = [string, any];

const SETUP: Step[] = [
  ['East|1|6', { winningSide: 1 }],
  ['East|1|1', { winningSide: 1 }],
  ['East|1|2', { winningSide: 2 }],
  ['East|1|4', { winningSide: 1 }],
  ['East|1|5', { winningSide: 1 }],
  ['East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['West|1|1', { winningSide: 1 }],
  ['East|1|3', { winningSide: 2 }],
  ['West|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['West|1|3', { winningSide: 2 }],
  ['South|2|1', { winningSide: 2 }],
];

const at = (drawId: string, coordinates: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);

function apply(drawId: string, [coordinates, outcome]: Step) {
  const target = at(drawId, coordinates);
  expect(target, coordinates).toBeDefined();
  const before = JSON.stringify(getDrawDefinition(drawId));
  const result = tournamentEngine.setMatchUpStatus({
    allowChangePropagation: true,
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    outcome,
    drawId,
  });
  return { error: result.error, mutated: JSON.stringify(getDrawDefinition(drawId)) !== before };
}

function play(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of SETUP) expect(apply(drawId, step).error, step[0]).toBeUndefined();
}

const participantIds = (matchUp: any) => (matchUp.sides ?? []).map((side: any) => side?.participantId).filter(Boolean);
const consistent = (drawId: string) =>
  expect(getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).toEqual([]);

it('a walkover arriving at a seat its matchUp was already decided for is carried past', () => {
  play('carried');
  const america = at('carried', 'East|1|8').sides.find((side: any) => side.sideNumber === 2).participantId;
  const southFinal = at('carried', 'South|2|1');
  expect(southFinal.matchUpStatus).toEqual(COMPLETED);

  expect(apply('carried', ['East|1|8', { matchUpStatus: WALKOVER, winningSide: 1 }]).error).toBeUndefined();

  const decided = at('carried', 'West|1|4');
  expect(decided.matchUpStatus).toEqual(WALKOVER);
  expect(decided.sides.find((side: any) => side.sideNumber === decided.winningSide)?.participantId).toEqual(america);
  expect(participantIds(at('carried', 'West|2|2'))).toContain(america);
  expect(at('carried', 'South|2|1')).toMatchObject({ matchUpStatus: COMPLETED, winningSide: southFinal.winningSide });
  consistent('carried');
});

it('a relabel that would take back an award whose winner played on is refused over an untouched draw', () => {
  play('relabel');
  const refused = apply('relabel', ['East|1|7', { winningSide: 1 }]);
  expect(refused.error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(refused.mutated).toEqual(false);
  consistent('relabel');
});
