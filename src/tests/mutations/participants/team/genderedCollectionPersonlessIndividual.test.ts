import { POLICY_MATCHUP_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

it('matchUpActions on a gendered collection leaves out a team member with no person instead of throwing', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    drawProfiles: [{ tieFormatName: USTA_GOLD_TEAM_CHALLENGE, eventType: TEAM_EVENT, drawSize: 2 }],
  });

  // one team member is recorded without a person (and so without a sex)
  const individuals = tournamentRecord.participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  const personlessParticipantId = individuals[0].participantId;
  delete individuals[0].person;

  let result: any = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);
  tournamentEngine.attachPolicies({ policyDefinitions: POLICY_MATCHUP_ACTIONS_DEFAULT });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.filter(({ matchUpType }) => matchUpType === TEAM_MATCHUP).length).toEqual(1);
  const maleSingles = matchUps.find(({ matchUpType, gender }) => matchUpType === SINGLES_MATCHUP && gender === MALE);

  const offeredIds: string[] = [];
  for (const sideNumber of [1, 2]) {
    result = tournamentEngine.matchUpActions({
      matchUpId: maleSingles.matchUpId,
      drawId: maleSingles.drawId,
      sideNumber,
    });
    expect(result.error).toBeUndefined();
    const assignAction = result.validActions.find(({ type }) => type === ASSIGN_PARTICIPANT);
    offeredIds.push(...assignAction.availableParticipantIds);
  }
  expect(offeredIds.length).toBeGreaterThan(0);
  // with no recorded sex the member cannot be shown to match a MALE collection
  expect(offeredIds).not.toContain(personlessParticipantId);
});
