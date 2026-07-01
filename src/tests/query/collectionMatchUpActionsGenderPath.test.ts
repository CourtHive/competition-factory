import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';

// Coverage for the mixed-doubles assignedGender inference in collectionMatchUpActions.
// The side count used the misspelled side.particiapntId (always undefined); corrected to
// side.participantId. The inference additionally gates on inContextMatchUp.sideNumber
// (not populated on collection matchUps), so the correction is behaviour-neutral today.
// This exercises the collection-matchUp actions path containing the corrected line.
it('returns collection matchUp actions (exercises the assignedGender inference path)', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM, drawSize: 4 }],
    setState: true,
  });

  const collectionMatchUp = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpTieId);
  expect(collectionMatchUp).toBeDefined();

  const result: any = tournamentEngine.matchUpActions({
    matchUpId: collectionMatchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });
  expect(Array.isArray(result.validActions)).toBe(true);
});
