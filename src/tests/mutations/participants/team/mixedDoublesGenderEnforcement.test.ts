import { POLICY_MATCHUP_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_PARTICIPANT } from '@Constants/errorConditionConstants';
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { DOUBLES_MATCHUP } from '@Constants/matchUpTypes';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

// Mixed-doubles second-participant gender enforcement. Previously `assignedGender` in
// collectionMatchUpActions was dead (gated on the never-set inContextMatchUp.sideNumber
// and reading person.sex off a pair side), so the second slot of a mixed pair still
// offered same-gender participants, and assignTieMatchUpParticipant did not reject a
// same-gender second member (its isGendered() check skips MIXED).

// nonRandom seeds a deterministic roster so both genders are present on the team.
function setupMixedDoubles() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    drawProfiles: [{ tieFormatName: USTA_GOLD_TEAM_CHALLENGE, eventType: TEAM_EVENT, drawSize: 2 }],
  });
  tournamentEngine.setState(tournamentRecord);
  tournamentEngine.attachPolicies({ policyDefinitions: POLICY_MATCHUP_ACTIONS_DEFAULT });
  const mixedDoubles = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.matchUpType === DOUBLES_MATCHUP && m.gender === 'MIXED');
  expect(mixedDoubles).toBeDefined();
  return mixedDoubles;
}

function assignAction(matchUpId: string, drawId: string) {
  const { validActions }: any = tournamentEngine.matchUpActions({ sideNumber: 1, matchUpId, drawId });
  return validActions.find((a: any) => a.type === ASSIGN_PARTICIPANT);
}

it('offers only the opposite gender for the second slot of a mixed pair', () => {
  const { matchUpId, drawId } = setupMixedDoubles();

  const action = assignAction(matchUpId, drawId);
  const male = action.availableParticipants.find((p: any) => p.person?.sex === MALE);
  expect(male).toBeDefined();

  const assigned: any = tournamentEngine[action.method]({ ...action.payload, participantId: male.participantId });
  expect(assigned.success).toEqual(true);

  const nextAction = assignAction(matchUpId, drawId);
  const offeredSexes = nextAction.availableParticipants.map((p: any) => p.person?.sex);
  expect(offeredSexes).not.toContain(MALE);
  expect(offeredSexes).toContain(FEMALE);
});

it('rejects a same-gender second member and accepts the opposite gender', () => {
  const md = setupMixedDoubles();
  const { matchUpId, drawId } = md;

  const action = assignAction(matchUpId, drawId);
  const male = action.availableParticipants.find((p: any) => p.person?.sex === MALE);
  const first: any = tournamentEngine[action.method]({ ...action.payload, participantId: male.participantId });
  expect(first.success).toEqual(true);

  // reach into the team roster for a second male (the offered list correctly hides them now)
  const dual = tournamentEngine
    .allTournamentMatchUps({ inContext: true })
    .matchUps.find((m: any) => m.matchUpId === md.matchUpTieId);
  const roster = dual.sides.find((s: any) => s.sideNumber === 1).participant.individualParticipants;
  const otherMale = roster.find((p: any) => p.person?.sex === MALE && p.participantId !== male.participantId);
  const female = roster.find((p: any) => p.person?.sex === FEMALE);
  expect(otherMale).toBeDefined();
  expect(female).toBeDefined();

  const sameGender: any = tournamentEngine[action.method]({
    ...action.payload,
    participantId: otherMale.participantId,
  });
  expect(sameGender.error).toEqual(INVALID_PARTICIPANT);

  const opposite: any = tournamentEngine[action.method]({ ...action.payload, participantId: female.participantId });
  expect(opposite.success).toEqual(true);
});
