import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// a result rates the same whichever side the winner was drawn into: the winner's K read countables[winningSide] on a
// [side1, side2] array, the loser's set count for a side 1 winner and nothing for a side 2 winner. Measured on 6-0 6-0
// from 1500 each: 1598/1402 when side 1 won, 1592/1414 when side 2 won.

function winnerAndLoser(winningSide: number, scoreString: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, outcomes: [{ roundNumber: 1, roundPosition: 1, scoreString, winningSide }] }],
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUp = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUp.matchUpId] });
  expect(result.success).toEqual(true);

  const ratingOf = (sideNumber: number) => {
    const participantId = matchUp.sides.find((side) => side.sideNumber === sideNumber).participantId;
    return result.modifiedScaleValues[participantId].scaleValue;
  };
  return [ratingOf(winningSide), ratingOf(3 - winningSide)];
}

it.each(['6-0 6-0', '6-4 4-6 6-4'])('rates %s the same for a side 1 and a side 2 winner', (scoreString) => {
  const side1Won = winnerAndLoser(1, scoreString);
  const side2Won = winnerAndLoser(2, scoreString);
  expect(side2Won).toEqual(side1Won);
  expect(side1Won[0]).toBeGreaterThan(side1Won[1]);
});
