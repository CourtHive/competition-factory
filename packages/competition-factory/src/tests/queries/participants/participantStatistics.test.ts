import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and types
import { WIN_RATIO } from '@Constants/statsConstants';
import { HydratedParticipant } from '@Types/hydrated';

const scenarios = [{ drawProfiles: [{ drawSize: 8 }], matchUpsCount: 7 }];

test.each(scenarios)('it can calculate new ratings given matchUp results', ({ drawProfiles, matchUpsCount }) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    randomWinningSide: true,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toEqual(matchUpsCount);

  const { participants: tournamentParticipants } = tournamentEngine.getParticipants({
    withStatistics: true,
    withMatchUps: true,
  });

  const { participants, participantMap } = tournamentEngine.getParticipants({
    withRankingProfile: true,
    withStatistics: true,
  });

  expect(participants.every(({ statistics }) => statistics.length)).toEqual(true);

  const hydratedParticipants: HydratedParticipant[] = Object.values(participantMap);

  expect(
    hydratedParticipants.every(({ structureParticipation }) => {
      const firstParticipation: any = Object.values(structureParticipation)[0];
      const { finishingMatchUpId, finishingPositionRange, finishingRound, rankingStage, roundNumber, drawId } =
        firstParticipation;
      return finishingPositionRange && finishingMatchUpId && finishingRound && rankingStage && roundNumber && drawId;
    }),
  ).toEqual(true);

  for (const participant of tournamentParticipants) {
    const winRatio = participant.statistics.find(({ statCode }) => statCode === WIN_RATIO);
    const matchUpsCount = participant.matchUps.length;
    expect(winRatio.denominator).toEqual(matchUpsCount);
    const { statistics } = participantMap[participant.participantId];
    expect(statistics[WIN_RATIO].denominator).toEqual(matchUpsCount);
  }
});
