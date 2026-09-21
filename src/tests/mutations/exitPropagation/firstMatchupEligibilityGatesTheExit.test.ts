import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, TO_BE_PLAYED, COMPLETED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A double exit feeds a FIRST_MATCHUP consolation only if one of its players was in their FIRST
 * match.
 *
 * `isFedLoserEligible` — zero prior scored wins — is applied by `directLoser` and by
 * `reconcileFedLoserEligibility`, and was applied NOWHERE on the double-exit path. So a produced
 * exit travelled a first-match link for participants who had already won a match, was carried
 * through the consolation BYE, and took the very side the winner of `Consolation|1|1` then advanced
 * into. She was awarded a win that never advanced — `WINNER_NOT_ADVANCED`, reported by
 * `getDrawInconsistencies` using this same predicate.
 *
 * The census's "ordinary play" population: 218 findings, no re-score, no policy flag, four actions.
 */

const draw = (nonRandom: number) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 16, drawId: 'A' }],
    nonRandom,
  });
  tournamentEngine.setState(tournamentRecord);
  const find = (structureName: string, roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) =>
          m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const put = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(structureName, roundNumber, roundPosition).matchUpId,
      drawId: 'A',
      outcome,
    });
  return { find, put };
};

it('a double exit whose players have both already won does NOT feed the consolation', () => {
  const { find, put } = draw(20324524);

  // both players of Main R2P1 win in round 1 — neither is a first-match loser
  expect(put('Main', 1, 1, { winningSide: 2 }).success).toEqual(true);
  expect(put('Main', 1, 2, { winningSide: 2 }).success).toEqual(true);
  expect(put('Main', 2, 1, { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);

  // nothing about Main R2P1 belongs in the consolation, so nothing was carried through its BYE
  const beforeArrival = find('Consolation', 3, 1);
  expect(beforeArrival.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(beforeArrival.sideExitProvenance).toBeUndefined();

  // the first-round loser plays her consolation match and advances through the BYE unobstructed
  expect(put('Consolation', 1, 1, { winningSide: 1 }).success).toEqual(true);
  expect(find('Consolation', 1, 1).matchUpStatus).toEqual(COMPLETED);

  const target = find('Consolation', 3, 1);
  expect(target.sides[0].participant.participantName).toEqual('Emmie Pevensie');

  // she is NOT sitting under an exit that was never hers, and is not awarded a win that goes nowhere
  expect(target.sideExitProvenance).toBeUndefined();
  expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(target.winningSide).toBeUndefined();

  const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies ?? []).toEqual([]);
});

it("CONTROL: a ROUND 1 double exit still carries onward through the BYE — CA's 2026-09-20 ruling", () => {
  const { put } = draw(20324524);

  /**
   * The case CA certified in TMX: *"the missing WALKOVER is not advanced past the [...] BYE in
   * consolation R2P1 which should produce a matchUpStatus: WALKOVER in consolation R3P1"*.
   *
   * A ROUND 1 double walkover's players have zero prior wins, so they ARE first-match losers and the
   * exit belongs in the consolation. The eligibility gate must leave this untouched — it narrows
   * only the case the rule was never true of.
   */
  expect(put('Main', 1, 1, { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);

  const fed = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m: any) => m.stage === 'CONSOLATION' && m.sideExitProvenance);

  // the exit reached the consolation, which is what the ruling requires
  expect(fed.length).toBeGreaterThan(0);
});
