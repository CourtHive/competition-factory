import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, it } from 'vitest';

// constants
import { MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('can return team statistics', () => {
  const drawSize = 8;
  const tournamentRecord = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize }],
    completeAllMatchUps: true,
    randomWinningSide: true,
    policyDefinitions,
  }).tournamentRecord;

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.getParticipantStats({ matchUps: [] });
  expect(result.error).toEqual(MISSING_MATCHUPS);

  result = tournamentEngine.getParticipantStats({ withScaleValues: true });

  expect(result.participatingTeamsCount).toEqual(drawSize);
  expect(result.allParticipantStats.length).toEqual(drawSize);

  const matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps;
  const sideParticipantIds = matchUps[0].sides.map(xa('participantId'));

  const [teamParticipantId, opponentParticipantId] = sideParticipantIds;

  result = tournamentEngine.getParticipantStats({
    withIndividualStats: true,
    teamParticipantId,
  });
  const teamParticiapntName = matchUps[0].sides[0].participant.participantName;
  expect(result.allParticipantStats[0].participantName).toEqual(teamParticiapntName);
  result.allParticipantStats.forEach((stats) => expect(stats.participantName).toBeDefined());

  result = tournamentEngine.getParticipantStats({
    withIndividualStats: false,
    opponentParticipantId,
    teamParticipantId,
  });

  expect(result.allParticipantStats.length).toEqual(2);
});
