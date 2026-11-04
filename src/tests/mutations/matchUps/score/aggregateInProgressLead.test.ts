import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/tournamentConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

// A leader is not a winner: an aggregate format names its winner only once every one of its N segments is in.
const matchUpFormat = 'SET3XA-S:T10';

it.each([
  { sets: [[5, 3]], label: 'one segment of three' },
  {
    sets: [
      [5, 3],
      [0, 1],
    ],
    label: 'two segments of three',
  },
])('an aggregate format in progress may lead after $label', ({ sets }) => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4, matchUpFormat }],
    setState: true,
  });
  const matchUp: any = tournamentEngine.allTournamentMatchUps().matchUps?.[0];

  const score = {
    sets: sets.map(([side1Score, side2Score], i) => ({ setNumber: i + 1, side1Score, side2Score })),
  };
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: IN_PROGRESS, score },
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const stored: any = tournamentEngine.findMatchUp({ drawId, matchUpId: matchUp.matchUpId }).matchUp;
  expect(stored.matchUpStatus).toEqual(IN_PROGRESS);
  expect(stored.winningSide).toBeUndefined();
  expect(stored.score.sets.length).toEqual(sets.length);
});

it('the lead becomes a win once all three segments are in', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 4, matchUpFormat }],
    setState: true,
  });
  const matchUp: any = tournamentEngine.allTournamentMatchUps().matchUps?.[0];
  const sets = [
    { setNumber: 1, side1Score: 5, side2Score: 3 },
    { setNumber: 2, side1Score: 0, side2Score: 1 },
    { setNumber: 3, side1Score: 2, side2Score: 2 },
  ];

  // a finished aggregate still names its winner
  let result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide: 1, score: { sets } },
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // and a finished aggregate cannot be given to the trailing side
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide: 2, score: { sets } },
    matchUpId: matchUp.matchUpId,
    drawId,
  });
  expect(result.success).toBeUndefined();
});
