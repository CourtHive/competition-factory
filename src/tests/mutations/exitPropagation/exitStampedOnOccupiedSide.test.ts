import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, WALKOVER, COMPLETED } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * CHARACTERISATION of an OPEN defect — the census's "ordinary play" population: 218 findings with
 * `propagateExitStatus: false` (so TMX can reach them) and NO re-scoring of any matchUp. Every one
 * of the 218 is `WINNER_NOT_ADVANCED`.
 *
 * A produced exit is stamped onto a side that HOLDS A LIVE PARTICIPANT. `Consolation|3|1` ends up
 * with `sideExitProvenance` on side 1 — the side Emmie Pevensie occupies, having won her way there
 * through a BYE — and is simultaneously awarded to side 1. A side cannot both have exited and have
 * won, and the winner never advances, which is what `getDrawInconsistencies` reports.
 *
 * Distinct from SIGNAL 4: nothing is re-scored here, and the corruption is in WHICH SIDE the exit
 * is recorded against rather than in a status left stale.
 *
 * See `Mentat/statuses/2026-09-20-overnight-census-on-a-corrected-harness.md`, "SIGNAL 5".
 */

it('OPEN DEFECT: a produced exit is stamped onto a side holding a live participant', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 16, drawId: 'A' }],
    nonRandom: 20324524,
  });
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

  // ordinary play: two first-round results, a double walkover in round 2, one consolation result
  expect(put(find('Main', 1, 1), { winningSide: 2 }).success).toEqual(true);
  expect(put(find('Main', 1, 2), { winningSide: 2 }).success).toEqual(true);
  expect(put(find('Main', 2, 1), { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);
  expect(put(find('Consolation', 1, 1), { winningSide: 1 }).success).toEqual(true);

  // Emmie Pevensie won her consolation match and then advanced through a BYE
  const won = find('Consolation', 1, 1);
  expect(won.matchUpStatus).toEqual(COMPLETED);
  expect(won.sides[0].participant.participantName).toEqual('Emmie Pevensie');
  expect(find('Consolation', 2, 1).matchUpStatus).toEqual('BYE');

  const target = find('Consolation', 3, 1);

  // side 1 holds her — a live participant
  expect(target.sides[0].participant.participantName).toEqual('Emmie Pevensie');
  expect(target.sides[1].participant).toBeUndefined();

  // ...and side 1 ALSO carries a produced-exit record, which cannot be true of an occupied side
  expect(target.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(target.sideExitProvenance?.[2]).toBeUndefined();

  // she is awarded the win, and it does not advance
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(target.winningSide).toEqual(1);
  expect(find('Consolation', 4, 1).drawPositions ?? []).toEqual([]);

  // WHEN THIS IS FIXED the provenance belongs on side 2 (the empty side the exit arrived on), and
  // the advancement to Consolation|4|1 must happen. Delete SIGNAL 5 from the status note then.
  const { inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies?.map((i: any) => i.issueType)).toEqual(['WINNER_NOT_ADVANCED']);
});
