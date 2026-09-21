import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, TO_BE_PLAYED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * Re-scoring a double exit must UNWIND the first one before producing the second.
 *
 * `doubleExitCleanup` fired only when LEAVING a double exit for a NON-double status, so a
 * double -> DOUBLE re-score unwound nothing. The previous cascade's produced exit survived on the
 * target, and `doubleExitAdvancement`'s `existingExit` read that survivor as a second exit ARRIVING
 * — a convergence — and wrote a DOUBLE exit where a single produced one belonged.
 *
 * Found by CA 2026-09-21 without looking at the consolation at all, and identified by CA's own
 * probe: CLEARING the matchUp and then scoring the second double exit was always correct, so the
 * fault lay in the residue the re-score left behind rather than in the write that followed.
 *
 * The damage ran two rounds, because a DOUBLE exit cascades where a single produced one does not.
 */

/** The draw CA measured, with positional accessors for its MAIN structure. */
function curtisDraw() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 16, participantsCount: 13, drawId: 'A' }],
    nonRandom: 20000119,
  });
  tournamentEngine.setState(tournamentRecord);
  const find = (roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) => m.structureName === 'Main' && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const put = (roundNumber: number, roundPosition: number, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ matchUpId: find(roundNumber, roundPosition).matchUpId, drawId: 'A', outcome });
  return { find, put };
}

it('a re-scored double exit produces a SINGLE exit, and does not cascade as a convergence', () => {
  const { find, put } = curtisDraw();

  expect(put(1, 7, { winningSide: 1 }).success).toEqual(true);
  expect(put(2, 4, { matchUpStatus: DOUBLE_DEFAULT }).success).toEqual(true);

  // the first double exit produces a DEFAULTED one round on — correct before the re-score
  expect(find(3, 2).matchUpStatus).toEqual(DEFAULTED);

  expect(put(2, 4, { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);

  // the SECOND double exit produces a WALKOVER — a single produced exit, not a convergence
  const target = find(3, 2);
  expect(target.matchUpStatus).toEqual(WALKOVER);

  // and the status agrees with the record it carries; before the fix the status said
  // DOUBLE_WALKOVER while its own provenance said WALKOVER
  expect(target.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);
  expect(target.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);

  // a single produced exit does NOT cascade onward; a double one would have
  const onward = find(4, 1);
  expect(onward.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(onward.sideExitProvenance).toBeUndefined();
});

it('CA CONTROL: re-scoring and clear-then-scoring must reach the SAME state', () => {
  const state = (clearFirst: boolean) => {
    const { find, put } = curtisDraw();
    put(1, 7, { winningSide: 1 });
    put(2, 4, { matchUpStatus: DOUBLE_DEFAULT });
    if (clearFirst) put(2, 4, { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } });
    put(2, 4, { matchUpStatus: DOUBLE_WALKOVER });
    return {
      'Main|3|2': find(3, 2).matchUpStatus,
      'Main|3|2 provenance': find(3, 2).sideExitProvenance?.[2]?.matchUpStatus,
      'Main|4|1': find(4, 1).matchUpStatus,
    };
  };

  // CA's probe, turned into the invariant it implies: how you got here must not change where you are
  expect(state(false)).toEqual(state(true));
});

it('CONTROL: without any re-score, an arriving winner is still awarded', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 8, drawId: 'A' }],
    nonRandom: 20161248,
  });
  tournamentEngine.setState(tournamentRecord);
  const locate = (structureName: string, roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) =>
          m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const apply = (matchUp: any, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, outcome });

  expect(apply(locate('Main', 1, 3), { matchUpStatus: DOUBLE_DEFAULT }).success).toEqual(true);
  expect(apply(locate('Main', 1, 4), { matchUpStatus: WALKOVER, winningSide: 2 }).success).toEqual(true);

  const target = locate('Main', 2, 2);
  expect(target.matchUpStatus).toEqual(DEFAULTED);
  expect(target.winningSide).toEqual(2);

  const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies ?? []).toEqual([]);
});
