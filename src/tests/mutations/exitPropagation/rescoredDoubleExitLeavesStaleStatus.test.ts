import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * CHARACTERISATION of an OPEN defect — the DOMINANT finding of the 2026-09-20 census, accounting
 * for 1582 of 1803 trustworthy findings as WINNER_NOT_ADVANCED plus 37 more as
 * WINNING_SIDE_ADVANCEMENT_MISMATCH.
 *
 * RE-SCORING a double exit as a DIFFERENT double exit re-derives the downstream `sideExitProvenance`
 * correctly but leaves the downstream `matchUpStatus` stale at the FIRST value. The target is then
 * stuck as a double exit, so the winner arriving from the sibling matchUp is never awarded, and a
 * produced exit cascades onward from a matchUp that should have had a live winner — awarding a side
 * that holds nobody, which is what `WINNER_NOT_ADVANCED` reports one round later.
 *
 * The control is in the second test: WITHOUT the re-score the very same draw is correct. That is
 * what makes this a re-score defect rather than an advancement defect.
 *
 * See `Mentat/statuses/2026-09-20-overnight-census-on-a-corrected-harness.md`, "SIGNAL 4".
 */

const seed = {
  drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 8, drawId: 'A' }],
  nonRandom: 20161248,
};

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord(seed);
  tournamentEngine.setState(tournamentRecord);

  const find = (structureName: string, roundNumber: number, roundPosition: number) => {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    return matchUps.find(
      (m: any) =>
        m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
  };
  const put = (matchUp: any, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, outcome });

  return { find, put };
}

it('CONTROL: without the re-score, the arriving winner is awarded', () => {
  const { find, put } = setup();

  expect(put(find('Main', 1, 3), { matchUpStatus: DOUBLE_DEFAULT }).success).toEqual(true);
  expect(put(find('Main', 1, 4), { matchUpStatus: WALKOVER, winningSide: 2 }).success).toEqual(true);

  // Main|1|3 exited on side 1; Main|1|4's winner arrived on side 2 and WINS
  const target = find('Main', 2, 2);
  expect(target.matchUpStatus).toEqual(DEFAULTED);
  expect(target.winningSide).toEqual(2);

  const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies ?? []).toEqual([]);
});

it('OPEN DEFECT: re-scoring a double exit leaves the downstream status stale', () => {
  const { find, put } = setup();

  expect(put(find('Main', 1, 3), { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);
  expect(put(find('Main', 1, 3), { matchUpStatus: DOUBLE_DEFAULT }).success).toEqual(true);
  expect(put(find('Main', 1, 4), { matchUpStatus: WALKOVER, winningSide: 2 }).success).toEqual(true);

  const target = find('Main', 2, 2);

  // the PROVENANCE was re-derived correctly — side 1 now names the DOUBLE_DEFAULT it came from
  expect(target.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(target.sideExitProvenance?.[1]?.matchUpStatus).toEqual(DEFAULTED);

  // ...but the STATUS did not follow it. It is still the DOUBLE_WALKOVER written by the first
  // score, so the winner arriving from Main|1|4 is never awarded.
  //
  // WHEN THIS IS FIXED both of the next two lines fail, and the CONTROL above says what they
  // should become: DEFAULTED with winningSide 2. Delete SIGNAL 4 from the status note then.
  expect(target.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(target.winningSide).toBeUndefined();

  // and one round later a produced exit is awarded to a side that holds nobody
  const onward = find('Main', 3, 1);
  expect(onward.matchUpStatus).toEqual(WALKOVER);
  expect(onward.winningSide).toEqual(2);

  const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies?.map((i: any) => i.issueType)).toContain('WINNER_NOT_ADVANCED');
});
