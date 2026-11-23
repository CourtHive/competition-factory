import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * **An exit a TD records against a winner is a result downstream of the matchUp that winner came from —
 * even when the other side is still empty.**
 *
 * Census seed 9000477 (COMPASS 32/29), three steps: `East|1|3` is decided, `East|2|2` (its winner on
 * side 1, side 2 still waiting on `East|1|4`) is recorded as a WALKOVER, and `East|1|3` is then flipped.
 * The flip was ACCEPTED: the walkover recorded against one player was then held by the other, and the
 * first stayed in North as its loser (WINNER_NOT_ADVANCED).
 *
 * `isActiveDownstream` counted a decided exit as active only with two drawPositions present, on the
 * reasoning that an exit with an empty side can only be a pending PROPAGATED one. With
 * `propagateExitStatus` a TD may award a walkover to a side still waiting on its feed (G3), so that
 * reasoning no longer holds; provenance tells the recorded exit from the produced one.
 *
 * Every cell records the exit against the `East|1|3` winner on a vacant opponent, then flips `East|1|3`:
 * refused, with the draw unchanged and consistent. Both exit statuses. (Awarding the exit TO the present
 * winner against the empty side is refused at entry — `ERR_INVALID_MATCHUP_STATUS`, "matchUpStatus requires
 * assigned participants" — so it never reaches here.)
 */
const drawId = 'recorded-exit';
const generate = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 32, participantsCount: 29, drawId }],
    nonRandom: 9000477,
    setState: true,
  });
};
const find = (roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find(
      (m: any) => m.structureName === 'East' && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
const drawState = () => JSON.stringify(tournamentEngine.getEvent({ drawId }).drawDefinition.structures);
const inconsistencies = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return getDrawInconsistencies({ drawDefinition }).inconsistencies?.map((i: any) => i.issueType) ?? [];
};

const CELLS = [WALKOVER, DEFAULTED].map((matchUpStatus) => ({ matchUpStatus }));

it.each(CELLS)('$matchUpStatus at East|2|2 to its vacant side: East|1|3 cannot be flipped', ({ matchUpStatus }) => {
  generate();
  let result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: find(1, 3).matchUpId,
    outcome: { winningSide: 2 },
    drawId,
  });
  expect(result.success).toEqual(true);

  // the precondition: the East|1|3 winner sits alone in East|2|2
  const target = find(2, 2);
  expect(target.sides.filter((side: any) => side.participantId).length).toEqual(1);
  expect(target.sides.find((side: any) => side.sideNumber === 1).participantId).toBeDefined();

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus, winningSide: 2 },
    matchUpId: target.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(inconsistencies()).toEqual([]);

  const before = drawState();
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: find(1, 3).matchUpId,
    outcome: { winningSide: 1 },
    drawId,
  });
  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
  expect(drawState()).toEqual(before);
  expect(inconsistencies()).toEqual([]);
});
