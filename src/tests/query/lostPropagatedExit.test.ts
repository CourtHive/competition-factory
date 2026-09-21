import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { PROPAGATED_EXIT_LOST } from '@Query/drawDefinition/getStructureInconsistencies';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * PROPAGATED_EXIT_LOST — the record says an exit arrived here; the status says nothing happened.
 *
 * Every other exit check in `getStructureInconsistencies` starts from a `winningSide` or from an
 * exit `matchUpStatus`. A matchUp whose exit has been ERASED has neither, so the whole class fell
 * through and the draw rated `valid: true` — the same structural blindness `BYE_ADVANCEMENT_MISSING`
 * was added for, where the check could not see a BYE because "a BYE is never won".
 *
 * That blindness is how SIGNAL 1 survived a census: the state it produces is a participant sitting
 * in a matchUp that can never be played, and nothing reported it.
 *
 * These draws are HAND-BROKEN on purpose. The defect that produced this state is fixed, so building
 * the state through the engine is no longer possible — and a detector asserted only through the bug
 * it was written for stops testing anything the moment that bug is fixed.
 */

/** A COMPASS draw carrying a resolved propagated exit at `West|2|1`, plus a way to corrupt it. */
function brokenDraw(mutate: (matchUp: any) => void) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId: 'A' }],
    nonRandom: 20223109,
  });
  tournamentEngine.setState(tournamentRecord);
  const locate = () =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((m: any) => m.structureName === 'West' && m.roundNumber === 2 && m.roundPosition === 1);
  const put = (roundPosition: number, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: tournamentEngine
        .allTournamentMatchUps()
        .matchUps.find(
          (m: any) => m.structureName === 'East' && m.roundNumber === 1 && m.roundPosition === roundPosition,
        ).matchUpId,
      drawId: 'A',
      outcome,
    });

  put(2, { matchUpStatus: DOUBLE_WALKOVER });
  put(4, { winningSide: 1 });
  put(3, { matchUpStatus: 'DOUBLE_DEFAULT' });

  const target = locate();
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(target.winningSide).toEqual(2);

  // reach into the STORED record and corrupt it, then re-seat the engine on the damaged draw
  const { tournamentRecord: stored } = tournamentEngine.getTournament();
  for (const event of stored.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      for (const structure of drawDefinition.structures ?? []) {
        for (const matchUp of structure.matchUps ?? []) {
          if (matchUp.matchUpId === target.matchUpId) mutate(matchUp);
        }
      }
    }
  }
  tournamentEngine.setState(stored);
  return tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
}

it('reports a matchUp whose propagated exit was erased from an EMPTY side', () => {
  const { valid, inconsistencies } = brokenDraw((matchUp) => {
    // the exit's record stays; the status it describes is wiped — side 1 holds no participant
    matchUp.matchUpStatus = TO_BE_PLAYED;
    delete matchUp.winningSide;
  });

  const reported = (inconsistencies ?? []).find((i: any) => i.issueType === PROPAGATED_EXIT_LOST);
  expect(reported).toBeDefined();
  expect(reported.sideNumber).toEqual(1);
  expect(reported.carriedMatchUpStatus).toEqual(WALKOVER);
  expect(valid).toEqual(false);
});

it('CONTROL: does NOT report a provenance record on a side that HOLDS a participant', () => {
  const { inconsistencies } = brokenDraw((matchUp) => {
    matchUp.matchUpStatus = TO_BE_PLAYED;
    delete matchUp.winningSide;
    // move the record onto side 2, which holds a real participant. That is a record of how someone
    // ARRIVED, not an exit delivered here — sweep seed 6161873 (OLYMPIC 16/16) is the live example,
    // an ordinary playable matchUp between two present participants.
    matchUp.sideExitProvenance = { 2: matchUp.sideExitProvenance?.[1] };
  });

  expect((inconsistencies ?? []).filter((i: any) => i.issueType === PROPAGATED_EXIT_LOST)).toEqual([]);
});

it('CONTROL: does NOT report a legitimately PENDING exit that nobody has reached yet', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId: 'A' }],
    nonRandom: 20223109,
  });
  tournamentEngine.setState(tournamentRecord);
  const east = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.structureName === 'East' && m.roundNumber === 1 && m.roundPosition === 2);
  tournamentEngine.setMatchUpStatus({
    matchUpId: east.matchUpId,
    drawId: 'A',
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
  });

  // carried, recorded, awarded to nobody, and entirely correct
  const { valid, inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies ?? []).toEqual([]);
  expect(valid).toEqual(true);
});
