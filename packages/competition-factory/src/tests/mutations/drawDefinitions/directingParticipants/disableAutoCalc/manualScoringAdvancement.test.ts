import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// test utilities
import { assignIndividualParticipants } from '@Tests/mutations/utilities/assignIndividualParticipants';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('supports disabling and then re-enabling auto-Calc', () => {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        drawProfiles: [{ drawId: 'did', drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
        eventType: TEAM_EVENT,
      },
    ],
    policyDefinitions,
    setState: true,
  });

  // get all team matchUps
  let teamMainMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    contextFilters: { stages: [MAIN] },
  }).matchUps;
  expect(teamMainMatchUps.length).toEqual(7);

  // set winningSide to 1 for all team matchUps
  // no lineUps have been created and no tieMatchUps are scored
  for (const teamMatchUp of teamMainMatchUps) {
    const { matchUpId, drawId } = teamMatchUp;
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1 },
      disableAutoCalc: true,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  teamMainMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
    contextFilters: { stages: [MAIN] },
  }).matchUps;
  expect(teamMainMatchUps.length).toEqual(7);

  const checkConsolationPositionAssignments = () => {
    const teamConsolationMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP], roundNumbers: [1] },
      contextFilters: { stages: [CONSOLATION] },
    }).matchUps;
    expect(teamConsolationMatchUps.length).toEqual(2);

    // expect teamConsolationMatchUps to have participantIds defined
    let errorsCount = 0;
    for (const teamMatchUp of teamConsolationMatchUps) {
      const { sides } = teamMatchUp;
      for (const side of sides) {
        if (!side?.participant?.participantId) errorsCount += 1;
      }
    }
    return errorsCount;
  };
  let errorsCount = checkConsolationPositionAssignments();
  expect(errorsCount).toEqual(0);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'did' });

  // because teams are already advanced, scorecard positions must be assigned for all rounds
  assignIndividualParticipants({ teamMatchUps: teamMainMatchUps, teamParticipants, drawDefinition });

  teamMainMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
    contextFilters: { stages: [MAIN] },
  }).matchUps;
  expect(teamMainMatchUps.length).toEqual(7);

  // all teamMatchUps have been scored and tieMatchUps positions assigned
  for (const teamMatchUp of teamMainMatchUps) {
    for (const tieMatchUp of teamMatchUp.tieMatchUps) {
      expect(tieMatchUp.sides[0].participant.participantId).not.toBeUndefined();
    }
  }

  // ensure that consolation positionAssignments have not been disturbed
  errorsCount = checkConsolationPositionAssignments();
  expect(errorsCount).toEqual(0);

  const targetTieMatchUp = teamMainMatchUps[0].tieMatchUps[0];
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetTieMatchUp.matchUpId,
    drawId: targetTieMatchUp.drawId,
    outcome: { winningSide: 1 },
  });
  expect(result.success).toEqual(true);

  errorsCount = checkConsolationPositionAssignments();
  expect(errorsCount).toEqual(0);
});
