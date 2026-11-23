import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { CLEAR_SCORE, SCORE } from '@Constants/matchUpActionConstants';

/**
 * **A carried or produced exit is changed at its ORIGIN, never where it was carried to** (CA, 2026-10-03).
 *
 * Census seed 9000184 (DOUBLE_ELIMINATION 32/30): `Main|1|8` is a WALKOVER, so its loser carries the
 * walkover into `Backdraw|1|5`, where the participant opposite wins it and advances. The director then
 * recorded `Backdraw|1|5` as RETIRED 6-3. That was ACCEPTED and kept the carried provenance, and clearing
 * `Main|1|8` afterwards withdrew the exit from under the score: a 6-3 on an undecided matchUp
 * (UNDECIDED_WITH_SCORE). A match between a player who never arrived and one who won by their absence.
 *
 * Now any direct write that would change the carried exit — a re-score, a different winner, a clear — is
 * refused with the draw unchanged, and neither SCORE nor CLEAR_SCORE is offered on it. A write that
 * changes nothing still passes. The correction is made at `Main|1|8`, which re-derives the Backdraw.
 */
const drawId = 'carried-exit';
const generate = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 32, participantsCount: 30, drawId }],
    nonRandom: 9000184,
    setState: true,
  });
};
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const find = (k: string) =>
  tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.find((m: any) => key(m) === k);
const submit = (k: string, outcome: any) =>
  tournamentEngine.setMatchUpStatus({ matchUpId: find(k).matchUpId, propagateExitStatus: true, outcome, drawId });
const snapshot = () => JSON.stringify(tournamentEngine.getEvent({ drawId }).drawDefinition.structures);
const clear = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const actionTypes = (k: string) =>
  (tournamentEngine.matchUpActions({ drawId, matchUpId: find(k).matchUpId }).validActions ?? []).map(
    (action: any) => action.type,
  );

const carry = () => {
  generate();
  let result: any = submit('Main|1|7', { winningSide: 1 });
  expect(result.success).toEqual(true);
  result = submit('Main|1|8', { matchUpStatus: WALKOVER, winningSide: 2 });
  expect(result.success).toEqual(true);
  // the precondition: Backdraw|1|5 holds the carried walkover and is decided by it
  const carried = find('Backdraw|1|5');
  expect(carried.matchUpStatus).toEqual(WALKOVER);
  expect(carried.winningSide).toEqual(1);
};

const REWRITES = [
  {
    name: 're-scored as RETIRED 6-3',
    outcome: {
      matchUpStatus: RETIRED,
      winningSide: 1,
      score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
    },
  },
  { name: 'relabelled as a played win', outcome: { winningSide: 1 } },
  { name: 'flipped to the other side', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { name: 'cleared', outcome: clear },
];

it.each(REWRITES)('a carried walkover cannot be $name', ({ outcome }) => {
  carry();
  const before = snapshot();
  const result: any = submit('Backdraw|1|5', outcome);
  expect(result.error).toEqual(CANNOT_CHANGE_OUTCOME);
  expect(snapshot()).toEqual(before);
});

it('a write that changes nothing passes, and neither SCORE nor CLEAR_SCORE is offered', () => {
  carry();
  const result: any = submit('Backdraw|1|5', { matchUpStatus: WALKOVER, winningSide: 1 });
  expect(result.success).toEqual(true);

  const types = actionTypes('Backdraw|1|5');
  expect(types).not.toContain(SCORE);
  expect(types).not.toContain(CLEAR_SCORE);
  // the control: an ordinary decided matchUp still offers both
  expect(actionTypes('Main|1|7')).toEqual(expect.arrayContaining([SCORE]));
});

it('the correction is made at the origin, which re-derives the carried matchUp', () => {
  carry();
  const result: any = submit('Main|1|8', clear);
  expect(result.success).toEqual(true);
  const rederived = find('Backdraw|1|5');
  expect(rederived.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(rederived.score?.scoreStringSide1 ?? '').toEqual('');
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});
