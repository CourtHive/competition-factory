import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, TO_BE_PLAYED, RETIRED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * CHARACTERISATION of an OPEN defect — SIGNAL 3, and the census's SECOND LARGEST group at 224
 * findings, every one of them reported as `UNDECIDED_WITH_SCORE`.
 *
 * When an upstream re-score un-decides a settled matchUp, `removeDirectedParticipants` clears the
 * `winningSide` and the `matchUpStatus` but NOT the `score`. The matchUp then reads TO_BE_PLAYED
 * while still displaying 6-3.
 *
 * The root cause is recorded in the status note, along with why the obvious fix
 * (`removeScore: !matchUpStatus`) is WRONG — it was attempted and produced 11 failures across the
 * substitution, partial-score and TEAM paths, so this needs a way to distinguish "unplayed again"
 * from "participants changed, the match stands".
 *
 * All seven steps are load-bearing: dropping any one leaves the draw in a state where a later step
 * is refused and the defect does not appear.
 *
 * See `Mentat/statuses/2026-09-20-overnight-census-on-a-corrected-harness.md`, "SIGNAL 3".
 */

it('OPEN DEFECT: an un-decided matchUp keeps the score of the result that was undone', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 6, drawId: 'A' }],
    nonRandom: 20262956,
  });
  tournamentEngine.setState(tournamentRecord);

  const find = (structureName: string, roundNumber: number, roundPosition: number) => {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    return matchUps.find(
      (m: any) =>
        m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
  };
  const put = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) => {
    const matchUp = find(structureName, roundNumber, roundPosition);
    return tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, outcome });
  };

  const score = { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' };

  expect(put('Main', 1, 2, { winningSide: 1 }).success).toEqual(true);
  expect(put('Main', 2, 1, { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);
  expect(put('Main', 1, 3, { winningSide: 1 }).success).toEqual(true);
  expect(put('Main', 2, 2, { winningSide: 2 }).success).toEqual(true);

  // Miranda Cassidy retires against Emmie Yates at 6-3, then that result is corrected to a plain win
  expect(put('Consolation', 3, 1, { matchUpStatus: RETIRED, winningSide: 1, score }).success).toEqual(true);
  expect(put('Consolation', 3, 1, { winningSide: 1 }).success).toEqual(true);

  // re-scoring Main|2|1 changes who belongs in the consolation, un-deciding Consolation|3|1
  expect(put('Main', 2, 1, { winningSide: 2 }).success).toEqual(true);

  const target = find('Consolation', 3, 1);

  // the status and the winner were cleared...
  expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(target.winningSide).toBeUndefined();

  // ...and the score of the undone result was NOT. This is the defect: a match that reads
  // "not yet played" while still showing 6-3.
  //
  // WHEN THIS IS FIXED the next two lines fail — the score should be gone. Do not fix it with
  // `removeScore: !matchUpStatus`; that was measured at 11 failures. Delete SIGNAL 3 from the
  // status note then.
  expect(target.score?.scoreStringSide1).toEqual('6-3');
  expect(target.score?.sets?.length).toEqual(1);
});
