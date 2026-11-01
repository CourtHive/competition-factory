import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/matchUpTypes';

// A TEAM dual's lines are numbered by the factory as they finish, per collection: a line played to a result finishes
// after the others; a cleared line leaves the order and the later lines move up; a walkover takes no number.

function dual(): any {
  return tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps?.find((matchUp) => matchUp.matchUpType === TEAM && matchUp.tieMatchUps?.length);
}

// a completed dual has its line-ups; clearing every line leaves lines that can be scored, with players assigned
function unscoredDual() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM }],
    completeAllMatchUps: true,
    setState: true,
  });
  const { drawId, tieMatchUps } = dual();
  for (const { matchUpId } of tieMatchUps) {
    const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: toBePlayed });
    expect(result.success).toEqual(true);
  }
  expect(dual().tieMatchUps.every((line) => line.matchUpStatus === TO_BE_PLAYED)).toEqual(true);
  expect(dual().tieMatchUps.every((line) => line.orderOfFinish === undefined)).toEqual(true);
  return dual();
}

const lines = (matchUpType: string) => dual().tieMatchUps.filter((line) => line.matchUpType === matchUpType);
const orderOf = (matchUpId: string) => dual().tieMatchUps.find((line) => line.matchUpId === matchUpId)?.orderOfFinish;

function score(matchUpId: string, scoreString = '6-1 6-1') {
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString, winningSide: 1 });
  const result: any = tournamentEngine.setMatchUpStatus({ drawId: dual().drawId, matchUpId, outcome });
  expect(result.success).toEqual(true);
}

function clear(matchUpId: string) {
  const result: any = tournamentEngine.setMatchUpStatus({ drawId: dual().drawId, matchUpId, outcome: toBePlayed });
  expect(result.success).toEqual(true);
}

it('numbers each line as it finishes, per collection', () => {
  unscoredDual();
  const [s1, s2, s3] = lines(SINGLES);
  const [d1] = lines(DOUBLES);

  score(s3.matchUpId);
  score(d1.matchUpId);
  score(s1.matchUpId);
  score(s2.matchUpId, '6-4 6-4');

  expect([orderOf(s3.matchUpId), orderOf(s1.matchUpId), orderOf(s2.matchUpId)]).toEqual([1, 2, 3]);
  expect(orderOf(d1.matchUpId)).toEqual(1);
});

it('a score edit keeps the number', () => {
  unscoredDual();
  const [s1, s2] = lines(SINGLES);
  score(s1.matchUpId);
  score(s2.matchUpId);
  score(s1.matchUpId, '6-2 6-2');
  expect([orderOf(s1.matchUpId), orderOf(s2.matchUpId)]).toEqual([1, 2]);
});

it('a cleared line leaves the order and the later lines move up', () => {
  unscoredDual();
  const [s1, s2, s3] = lines(SINGLES);
  score(s1.matchUpId);
  score(s2.matchUpId);
  score(s3.matchUpId);

  clear(s1.matchUpId);
  expect([orderOf(s1.matchUpId), orderOf(s2.matchUpId), orderOf(s3.matchUpId)]).toEqual([undefined, 1, 2]);

  score(s1.matchUpId);
  expect(orderOf(s1.matchUpId)).toEqual(3);
});

it('a walkover takes no number', () => {
  unscoredDual();
  const [s1, s2] = lines(SINGLES);
  score(s1.matchUpId);
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    matchUpId: s2.matchUpId,
    drawId: dual().drawId,
  });
  expect(result.success).toEqual(true);
  expect([orderOf(s1.matchUpId), orderOf(s2.matchUpId)]).toEqual([1, undefined]);
});
