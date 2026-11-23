import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, TO_BE_PLAYED, COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';

/**
 * A result whose propagation is LOAD-BEARING for a decided downstream outcome cannot be re-scored.
 *
 * This began as a characterisation of the census's second-largest group — 224 findings reported as
 * `UNDECIDED_WITH_SCORE`, a matchUp reading TO_BE_PLAYED while still showing 6-3. CA re-diagnosed it
 * 2026-09-21: *"the consolation structure is completed and the outcome of R2P1 should not be allowed
 * to be rescored since the propagation was load bearing to outcomes that had already been decided.
 * Seems like this is a fail in downstream active status."*
 *
 * That was right. The score residue was the symptom; the un-decide should never have been permitted.
 * `isActiveDownstream`'s fed-FMLC-BYE short-circuit declared the BYE inert whenever the matchUp
 * beyond it was not an EXIT — so a propagated walkover downstream blocked the re-score while a match
 * two participants had actually PLAYED did not, and the dispatch never reached the guard that would
 * have refused.
 *
 * Both halves are pinned here, because widening the guard alone wrongly refuses a FIRST entry.
 */

it('refuses a re-score whose propagation is load-bearing, and leaves the decided result standing', () => {
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
  expect(put('Consolation', 3, 1, { matchUpStatus: RETIRED, winningSide: 1, score }).success).toEqual(true);
  expect(put('Consolation', 3, 1, { winningSide: 1 }).success).toEqual(true);

  // Main|2|1's DOUBLE_WALKOVER fed the consolation, and Consolation|3|1 has since been PLAYED.
  // Re-scoring it would un-decide that played match, so it is refused.
  const result: any = put('Main', 2, 1, { winningSide: 2 });
  expect(result.success).toBeUndefined();

  // A double exit has NO winningSide, so the refusal must not name one — CA, 2026-09-21.
  expect(result.error).toEqual(CANNOT_CHANGE_OUTCOME);

  // and the decided consolation result is untouched — no TO_BE_PLAYED carrying a 6-3
  const consolation = find('Consolation', 3, 1);
  expect(consolation.matchUpStatus).toEqual(COMPLETED);
  expect(consolation.winningSide).toEqual(1);
  expect(consolation.score?.scoreStringSide1).toEqual('6-3');
});

it('CONTROL: a FIRST entry above a played consolation is allowed, and still propagates', () => {
  const winningSide = 1;
  const stage = 'CONSOLATION';
  const drawProfiles = [
    {
      drawSize: 16,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      outcomes: [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((roundPosition) => ({ roundNumber: 1, roundPosition, winningSide })),
        ...[1, 2, 3, 4].map((roundPosition) => ({ stage, roundNumber: 1, roundPosition, winningSide })),
        { stage, roundNumber: 3, roundPosition: 1, winningSide },
        { stage, roundNumber: 3, roundPosition: 2, winningSide },
        { stage, roundNumber: 4, roundPosition: 1, winningSide },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  const { upcomingMatchUps } = tournamentEngine.tournamentMatchUps();
  const target = upcomingMatchUps.filter((m: any) => m.stage === MAIN)[0];

  // never decided: nothing has propagated from it, so it cannot invalidate anything
  expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(target.winningSide).toBeUndefined();

  expect(
    tournamentEngine.setMatchUpStatus({ outcome: { winningSide: 2 }, matchUpId: target.matchUpId, drawId }).success,
  ).toEqual(true);

  // and it must PROPAGATE — routing a first entry away from the propagating branch silently
  // stopped the winner advancing in 27 exitPropagationMatrix cells
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const after = matchUps.find((m: any) => m.matchUpId === target.matchUpId);
  const next = matchUps.find((m: any) => m.matchUpId === after.winnerMatchUpId);
  expect((next?.drawPositions ?? []).filter(Boolean).length).toBeGreaterThan(0);
});
