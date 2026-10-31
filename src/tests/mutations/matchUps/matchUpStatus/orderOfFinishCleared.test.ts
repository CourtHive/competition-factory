import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { SINGLES, TEAM } from '@Constants/matchUpTypes';

// `orderOfFinish` (setOrderOfFinish) ranks the completed matchUps of a cohort. A matchUp that is no longer complete has
// no place in that order, so a write that leaves it outside a completed status removes the value, in v1 and in v2.

function completedDual() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM }],
    completeAllMatchUps: true,
    setState: true,
  });
  const dual = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps.find((m) => m.matchUpType === TEAM);
  const singles = dual.tieMatchUps.filter((m) => m.matchUpType === SINGLES);
  expect(singles.every((m) => m.matchUpStatus === COMPLETED)).toEqual(true);

  const finishingOrder = singles.map(({ matchUpId }, index) => ({ matchUpId, orderOfFinish: index + 1 }));
  const result: any = tournamentEngine.setOrderOfFinish({ drawId: dual.drawId, finishingOrder });
  expect(result.success).toEqual(true);
  return { drawId: dual.drawId, singles };
}

const orderOf = (drawId: string, matchUpId: string) =>
  tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp?.orderOfFinish;

it('a line whose score is cleared loses its order of finish; the others keep theirs', () => {
  const { drawId, singles } = completedDual();
  const [cleared, ...others] = singles;
  expect(orderOf(drawId, cleared.matchUpId)).toEqual(1);

  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: cleared.matchUpId, outcome: toBePlayed });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId: cleared.matchUpId });
  expect(matchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUp?.orderOfFinish).toBeUndefined();
  others.forEach(({ matchUpId }, index) => expect(orderOf(drawId, matchUpId)).toEqual(index + 2));
});

it('a completed line that is re-scored keeps its order of finish', () => {
  const { drawId, singles } = completedDual();
  const [line] = singles;
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 1 });

  const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome });
  expect(result.success).toEqual(true);
  expect(orderOf(drawId, line.matchUpId)).toEqual(1);
});

it('a cleared matchUp in an elimination round loses its order of finish', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    completeAllMatchUps: true,
    setState: true,
  });
  const roundOne = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { roundNumbers: [1] } })
    .matchUps.filter((m) => m.matchUpStatus === COMPLETED);
  const finishingOrder = roundOne.map(({ matchUpId }, index) => ({ matchUpId, orderOfFinish: index + 1 }));
  let result: any = tournamentEngine.setOrderOfFinish({ drawId, finishingOrder });
  expect(result.success).toEqual(true);

  // the final has no dependents, so clearing it is allowed; set an order on it first
  const final = tournamentEngine.allDrawMatchUps({ drawId, inContext: true, matchUpFilters: { roundNumbers: [3] } })
    .matchUps[0];
  result = tournamentEngine.setOrderOfFinish({
    drawId,
    finishingOrder: [{ matchUpId: final.matchUpId, orderOfFinish: 1 }],
  });
  expect(result.success).toEqual(true);
  expect(orderOf(drawId, final.matchUpId)).toEqual(1);

  result = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: final.matchUpId, outcome: toBePlayed });
  expect(result.success).toEqual(true);
  expect(orderOf(drawId, final.matchUpId)).toBeUndefined();
  expect(orderOf(drawId, roundOne[0].matchUpId)).toEqual(1);
});
