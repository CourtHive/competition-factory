import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * **A matchUp whose only carried exit is withdrawn is no longer an exit, whatever else its provenance
 * still records.**
 *
 * Census seed 9300405 (DOUBLE_ELIMINATION 8/5), three steps:
 *
 *  1. `Main|1|2` is a walkover: its loser carries the exit into `Backdraw|2|2`.
 *  2. `Main|2|2` is a walkover: its loser carries the exit into the same `Backdraw|2|2`, which converges
 *     into a double exit and produces an exit onward into `Backdraw|3|1`.
 *  3. `Main|1|2` is re-scored as played with the winner flipped: its new loser arrives without an exit.
 *
 * `Backdraw|2|2` is no longer a double exit, so the exit it produced in `Backdraw|3|1` is stale and
 * `reconcileStaleExitOrigins` withdraws it. That matchUp's provenance also held a BYE ARRIVAL on side 1,
 * which is a fact, not an exit (P19), and `withdrawFromMatchUp` kept the matchUp a WALKOVER because
 * SOMETHING remained. The new loser then won their way into side 2 and was recorded as the winner of a
 * walkover nobody gave (EXIT_WITHOUT_LOSER, WINNER_NOT_ADVANCED).
 *
 * Both exit statuses. `Backdraw|3|1` ends undecided, holding the new loser and waiting for its opponent.
 */
const drawId = 'withdrawn-exit';
const generate = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 5, drawId }],
    nonRandom: 9300405,
    setState: true,
  });
};
const find = (structureName: string, roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.find(
      (m: any) =>
        m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
const record = (roundNumber: number, roundPosition: number, outcome: any) =>
  tournamentEngine.setMatchUpStatus({
    matchUpId: find('Main', roundNumber, roundPosition).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });
const inconsistencies = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return getDrawInconsistencies({ drawDefinition }).inconsistencies?.map((i: any) => i.issueType) ?? [];
};

it.each([WALKOVER, DEFAULTED])('%s twice into one Backdraw matchUp, then the first re-scored', (matchUpStatus) => {
  generate();
  let result: any = record(1, 2, { matchUpStatus, winningSide: 1 });
  expect(result.success).toEqual(true);
  result = record(2, 2, { matchUpStatus, winningSide: 2 });
  expect(result.success).toEqual(true);
  // the precondition: the convergence produced an exit into Backdraw|3|1
  expect(find('Backdraw', 3, 1).matchUpStatus).toEqual(matchUpStatus);

  result = record(1, 2, { winningSide: 2 });
  expect(result.success).toEqual(true);

  const newLoserId = find('Main', 1, 2).sides.find((side: any) => side.sideNumber === 1).participantId;
  const target = find('Backdraw', 3, 1);
  expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(target.winningSide).toBeUndefined();
  expect(target.sides.map((side: any) => side.participantId)).toContain(newLoserId);
  expect(inconsistencies()).toEqual([]);
});
