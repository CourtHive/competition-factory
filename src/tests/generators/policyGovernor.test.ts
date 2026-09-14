import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test, it } from 'vitest';

// constants and fixtures
import { POLICY_TYPE_AVOIDANCE, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import POLICY_SCORING_DEFAULT from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import AVOIDANCE_COUNTRY from '@Fixtures/policies/POLICY_AVOIDANCE_COUNTRY';
import { SINGLES, TEAM_EVENT } from '@Constants/eventConstants';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { DEFAULTED } from '@Constants/matchUpStatusConstants';
import { SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_POLICY_TYPE,
  INVALID_VALUES,
  MISSING_POLICY_DEFINITION,
  MISSING_TOURNAMENT_RECORD,
  POLICY_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can set and remove policies from tournamentRecords and events', () => {
  expect(tournamentEngine).toHaveProperty('attachPolicies');

  // cannot attach a policy if no tournamentRecord
  tournamentEngine.reset();
  let scoringPolicy: any = { [POLICY_TYPE_SCORING]: { policyName: 'TEST' } };
  let result = tournamentEngine.attachPolicies({ policyDefinitions: scoringPolicy });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  const newTournamentRecord = tournamentEngine.newTournamentRecord();

  tournamentEngine.setState(newTournamentRecord);
  result = tournamentEngine.attachPolicies();

  expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
  result = tournamentEngine.attachPolicies({
    policyDefinitions: scoringPolicy,
    allowReplacement: true,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  scoringPolicy = { [POLICY_TYPE_SCORING]: { policyName: 'TEST', someAttribute: 'someValue' } };
  result = tournamentEngine.attachPolicies({
    policyDefinitions: scoringPolicy,
    allowReplacement: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.attachPolicies({ policyDefinitions: scoringPolicy });
  expect(result.error).toEqual(EXISTING_POLICY_TYPE);

  const { tournamentRecord } = tournamentEngine.getTournament();
  const { appliedPolicies } = getAppliedPolicies({ tournamentRecord });
  expect(appliedPolicies?.scoring?.policyName).toEqual('TEST');

  // test adding event policies
  const event = { eventName: 'Test Event', eventType: SINGLES };

  result = tournamentEngine.addEvent({ event });
  const { event: eventResult, success } = result;
  const { eventId } = eventResult;
  expect(success).toEqual(true);

  result = tournamentEngine.attachPolicies({ eventId });
  expect(result.error).toEqual(MISSING_POLICY_DEFINITION);

  result = tournamentEngine.attachPolicies({
    policyDefinitions: {},
    eventId,
  });
  expect(result.error).toEqual(MISSING_POLICY_DEFINITION);

  result = tournamentEngine.attachPolicies({ policyDefinitions: AVOIDANCE_COUNTRY, eventId });
  expect(result.success).toEqual(true);

  const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
  expect(updatedRecord.events.length).toEqual(1);
  expect(updatedRecord.events[0].extensions.length).toEqual(1);

  const { appliedPolicies: updatedAppliedPolicies } = tournamentEngine.getAppliedPolicies({ eventId });
  expect(updatedAppliedPolicies.avoidance.policyName).toEqual('Nationality Code');

  result = tournamentEngine.attachPolicies({
    policyDefinitions: AVOIDANCE_COUNTRY,
    eventId,
  });
  expect(result.error).toEqual(EXISTING_POLICY_TYPE);

  result = tournamentEngine.attachPolicies({
    policyDefinitions: AVOIDANCE_COUNTRY,
    allowReplacement: true,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord: updatedRecord2 } = tournamentEngine.getTournament();
  expect(updatedRecord2.events.length).toEqual(1);
  expect(updatedRecord2.events[0].extensions.length).toEqual(1);

  const eventState = updatedRecord2.events[0];

  result = tournamentEngine.removePolicy({ policyType: POLICY_TYPE_AVOIDANCE });
  expect(result.error).toEqual(POLICY_NOT_FOUND);

  result = tournamentEngine.removePolicy({
    eventId: eventState.eventId,
    policyType: 'Foobar',
  });
  expect(result.error).toEqual(POLICY_NOT_FOUND);

  result = tournamentEngine.removePolicy({
    policyType: POLICY_TYPE_AVOIDANCE,
    eventId: eventState.eventId,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord: updatedRecord3 } = tournamentEngine.getTournament();
  expect(updatedRecord3.events.length).toEqual(1);
  expect(updatedRecord3.events[0].extensions.length).toEqual(1);

  result = tournamentEngine.attachPolicies({
    policyDefinitions: { ...AVOIDANCE_COUNTRY, ...POLICY_SCORING_DEFAULT },
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.removePolicy({
    policyType: POLICY_TYPE_AVOIDANCE,
    eventId: eventState.eventId,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord: updatedRecord4 } = tournamentEngine.getTournament();
  expect(updatedRecord4.events.length).toEqual(1);
  expect(updatedRecord4.events[0].extensions.length).toEqual(1);
});

it('can find policies whether on event or tournamentRecord', () => {
  const newTournamentRecord = tournamentEngine.newTournamentRecord();
  tournamentEngine.setState(newTournamentRecord);

  let result = tournamentEngine.findPolicy({
    policyType: POLICY_TYPE_SCORING,
  });
  expect(result.info).toEqual(POLICY_NOT_FOUND.message);

  const testPolicyName = 'TEST';
  const scoringPolicy = {
    [POLICY_TYPE_SCORING]: {
      policyName: testPolicyName,
      someAttribute: 'someValue',
    },
  };
  result = tournamentEngine.attachPolicies({ policyDefinitions: scoringPolicy });
  expect(result.success).toEqual(true);

  let { policy } = tournamentEngine.findPolicy({ policyType: POLICY_TYPE_SCORING });
  expect(policy.policyName).toEqual(testPolicyName);

  const event = { eventName: 'Test Event', eventType: SINGLES };

  result = tournamentEngine.addEvent({ event });
  const { event: eventResult } = result;
  const { eventId } = eventResult;
  expect(result.success).toEqual(true);

  // expect to find the policy attached to the tournament even when passing eventId
  ({ policy } = tournamentEngine.findPolicy({
    policyType: POLICY_TYPE_SCORING,
    eventId,
  }));
  expect(policy.policyName).toEqual(testPolicyName);

  result = tournamentEngine.attachPolicies({
    policyDefinitions: AVOIDANCE_COUNTRY,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
  expect(updatedRecord.events.length).toEqual(1);
  expect(updatedRecord.events[0].extensions.length).toEqual(1);

  ({ policy } = tournamentEngine.findPolicy({ policyType: POLICY_TYPE_SCORING }));
  expect(policy.policyName).toEqual(testPolicyName);
  result = tournamentEngine.getAllowedMatchUpFormats({
    categoryName: undefined,
    categoryType: undefined,
  });
  expect(result).toEqual([]);

  ({ policy } = tournamentEngine.findPolicy({ policyType: POLICY_TYPE_AVOIDANCE }));
  expect(policy).toBeUndefined();

  ({ policy } = tournamentEngine.findPolicy({
    policyType: POLICY_TYPE_AVOIDANCE,
    eventId,
  }));
  expect(policy.policyName).toEqual('Nationality Code');

  result = tournamentEngine.attachPolicies({
    policyDefinitions: scoringPolicy,
    eventId,
  });

  expect(result.error).toEqual(EXISTING_POLICY_TYPE);

  result = tournamentEngine.attachPolicies({
    policyDefinitions: scoringPolicy,
    allowReplacement: true,
    eventId,
  });
  expect(result.success).toEqual(true);
});

test('Scoring policy can control attachment of process codes to matchUps', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 2 }],
    policyDefinitions: POLICY_SCORING_DEFAULT,
  });
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const {
    matchUps: [matchUp],
  } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES_MATCHUP] },
  });
  expect(matchUp.processCodes).toBeUndefined();

  // no assignments have been made
  expect(matchUp.sides.every((side) => !side.participantId)).toEqual(true);

  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUp.matchUpId] },
  });
  expect(result.matchUps[0].processCodes).toEqual(['RANKING.IGNORE']);

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    outcome: {},
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpIds: [matchUp.matchUpId] },
  });
  expect(result.matchUps[0].processCodes).toBeUndefined();
});

it('can set and reset policy governor', () => {
  // cannot attach a policy if no drawDefinition
  let result = attachPolicies({ policyDefinitions: SEEDING_ITF });
  expect(result).toMatchObject({ error: INVALID_VALUES });

  const drawDefinition = newDrawDefinition();

  result = attachPolicies({ drawDefinition, policyDefinitions: SEEDING_ITF });
  expect(result).toMatchObject(SUCCESS);

  const { appliedPolicies } = getAppliedPolicies({ drawDefinition });
  const { seedingProfile, policyName } = appliedPolicies?.seeding ?? {};

  expect(policyName).toEqual('ITF SEEDING');
  expect(seedingProfile).not.toBeUndefined();
});
