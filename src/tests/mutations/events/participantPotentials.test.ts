import { generateTournamentRecord } from '@Assemblies/generators/mocks/generateTournamentRecord';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';

it('can return event matchUps with potential participants', () => {
  const drawProfiles = [
    {
      participantsCount: 6,
      drawSize: 8,
    },
  ];
  const { drawIds, tournamentRecord } = generateTournamentRecord({
    drawProfiles,
  });

  const drawId = drawIds[0];

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    nextMatchUps: true,
    drawId,
  });

  const roundMatchUps: any = getRoundMatchUps({ matchUps }).roundMatchUps;

  const winnerMatchUpId = roundMatchUps[2][0].winnerMatchUpId;
  const winnerToMatchUpId = roundMatchUps[2][0].winnerTo.matchUpId;
  const firstPositionThirdRoundMatchUpId = roundMatchUps[3][0].matchUpId;
  expect(winnerMatchUpId).toEqual(winnerToMatchUpId);
  expect(winnerMatchUpId).toEqual(firstPositionThirdRoundMatchUpId);

  // expect the potentialParticipants for the 2nd round match to include 1st round participants
  expect(roundMatchUps[1][1].sides.map(({ participant }) => participant)).toEqual(
    roundMatchUps[2][0].potentialParticipants[0],
  );
});

it('participant object include potentials', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      eventType: DOUBLES_EVENT,
      drawSize: 8,
    },
  ];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    withPotentialMatchUps: true,
    withMatchUps: true,
  });
  expect(participants.length).toEqual(participants.map((p) => p.potentialMatchUps).filter(Boolean).length);
});

it('handles potential BYES for FMLC consolation structures', () => {
  const drawProfiles = [
    {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      participantsCount: 14,
      drawSize: 16,
    },
  ];
  const { tournamentRecord } = generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    nextMatchUps: true,
  });

  const consolationMatchUps = matchUps.filter(({ stage }) => stage === CONSOLATION);
  const roundMatchUps: any = getRoundMatchUps({
    matchUps: consolationMatchUps,
  }).roundMatchUps;
  // a group's order follows the sources: the marker is one group's, wherever it stands (a loser skipping a BYE in the
  // first round now reaches this matchUp too, CA 2026-10-26)
  const groups = roundMatchUps[2][0].potentialParticipants;
  expect(groups.some((group: any[]) => group.some((entry) => entry.bye))).toEqual(true);
  // and no BYE matchUp of the consolation holds potentials
  const byes = consolationMatchUps.filter(({ matchUpStatus }) => matchUpStatus === 'BYE');
  expect(byes.length).toBeGreaterThan(0);
  expect(byes.filter((matchUp: any) => matchUp.potentialParticipants?.length)).toEqual([]);
});

it('removes potential participants when side participant is known', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      outcomes: [
        {
          scoreString: '6-1 6-2',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { matchUps } = tournamentEngine.allDrawMatchUps({
    nextMatchUps: true,
    drawId,
  });

  const { roundMatchUps } = getRoundMatchUps({ matchUps });
  expect(roundMatchUps?.[2]?.[0]?.sides?.filter(({ sideNumber }) => sideNumber).length).toEqual(1);
  expect(roundMatchUps?.[2][0].potentialParticipants.length).toEqual(1);

  expect(roundMatchUps?.[2]?.[1].sides?.filter(({ sideNumber }) => sideNumber).length).toEqual(0);
  expect(roundMatchUps?.[2][1].potentialParticipants.length).toEqual(2);
});
