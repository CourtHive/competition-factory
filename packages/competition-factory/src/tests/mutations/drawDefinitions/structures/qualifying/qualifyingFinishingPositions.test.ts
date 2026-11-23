import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

it('generates expected finishingPositions for qualifying structures', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles: [
      {
        ignoreDefaults: true, // suppress default generation of MAIN
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [{ stageSequence: 1, drawSize: 8, qualifyingPositions: 2 }],
          },
        ],
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(6);

  const fprMap = {};
  matchUps.forEach(({ roundNumber, finishingPositionRange }) => (fprMap[roundNumber] = finishingPositionRange));

  expect(fprMap).toEqual({
    1: { loser: [5, 8], winner: [2, 4] },
    2: { loser: [3, 4], winner: [2, 2] },
  });

  const { participants } = tournamentEngine.getParticipants({
    withRankingProfile: true,
  });
  const qualifyingParticipant = participants.find((p) => {
    const structureParticipation = p.draws?.[0]?.structureParticipation?.[0];
    return structureParticipation.finishingRound === 1 && structureParticipation.participantWon;
  });
  expect(qualifyingParticipant.draws[0].structureParticipation[0].winCount).toEqual(2);
});
