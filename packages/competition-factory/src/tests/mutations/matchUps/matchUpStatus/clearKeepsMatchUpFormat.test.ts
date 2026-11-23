import { clearOutcome } from '../../../testHarness/exitPropagation/transitions';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A matchUp-level `matchUpFormat` survives a clear and a walkover (CA, 2026-10-01: the format is a
 * property of the match, not of its result). The blank in `applyScoreAndStatus` goes through the
 * `toBePlayed` fixture, which carries `matchUpFormat: undefined`; until this was decided, a director
 * who set F:TB10 on one match and then cleared a mis-entered score lost the format with it. The
 * corpus measured it on real records (outcome-pipeline spec § 4, then OPEN 1).
 */
const FORMAT = 'SET3-S:6/TB7-F:TB10';

function scoredMatchUpWithFormat() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { drawId, matchUpId } = matchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, matchUpFormat: FORMAT, outcome });
  expect(result.success).toEqual(true);
  const scored = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(scored.matchUpStatus).toEqual(COMPLETED);
  expect(scored.matchUpFormat).toEqual(FORMAT);
  return { drawId, matchUpId };
}

it('a clear keeps the matchUp-level format and blanks everything else', () => {
  const { drawId, matchUpId } = scoredMatchUpWithFormat();
  let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: clearOutcome });
  expect(result.success).toEqual(true);
  const cleared = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(cleared.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(cleared.winningSide).toBeUndefined();
  expect(cleared.score?.sets).toBeUndefined();
  expect(cleared.matchUpFormat).toEqual(FORMAT);
});

it('a walkover over a scored matchUp keeps the format too', () => {
  const { drawId, matchUpId } = scoredMatchUpWithFormat();
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  const walkover = tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp;
  expect(walkover.matchUpStatus).toEqual(WALKOVER);
  expect(walkover.matchUpFormat).toEqual(FORMAT);
});

it('a call that carries a new format on a clear writes the new one', () => {
  const { drawId, matchUpId } = scoredMatchUpWithFormat();
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: clearOutcome,
    matchUpFormat: 'SET1-S:6/TB7',
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(tournamentEngine.findMatchUp({ drawId, matchUpId }).matchUp.matchUpFormat).toEqual('SET1-S:6/TB7');
});
