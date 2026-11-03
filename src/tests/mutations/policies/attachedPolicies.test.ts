import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

import { POLICY_TYPE_ROUND_NAMING, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { APPLIED_POLICIES, FLIGHT_PROFILE } from '@Constants/extensionConstants';
import ROUND_NAMING_POLICY from '@Tests/mutations/publishing/roundNamingPolicy';
import POLICY_SEEDING_BYES from '@Fixtures/policies/POLICY_SEEDING_BYES';
import { AD_HOC, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import POLICY_SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';

it('generateDrawDefinition will find seeding policy attached to tournamentRecord', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { ...ROUND_NAMING_POLICY, ...POLICY_SEEDING_ITF },
    drawProfiles: [{ drawSize: 32, drawType: AD_HOC }],
  });

  tournamentEngine.setState(tournamentRecord);
  // applied policies are the first-class appliedPolicies attribute (CODES), not an extension
  expect(tournamentRecord.extensions?.some(({ name }) => name === APPLIED_POLICIES)).toBeFalsy();
  expect(Object.keys(tournamentRecord.appliedPolicies ?? {}).length).toEqual(2);

  expect(tournamentRecord.appliedPolicies?.[POLICY_TYPE_ROUND_NAMING]).not.toBeUndefined();

  expect(tournamentRecord.appliedPolicies?.[POLICY_TYPE_SEEDING]).not.toBeUndefined();

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.structures.length).toEqual(1);
  expect(drawDefinition.structures[0].finishingPosition).toEqual(WIN_RATIO);

  // There is no POLICY_TYPE_SEEDING on the drawDefinition because it is attached to the tournamentRecord
  expect(drawDefinition.extensions?.length ?? 0).toEqual(0);
  expect(drawDefinition.appliedPolicies).toBeUndefined();
});

it('generateDrawDefinition will find seeding policy attached to event', () => {
  const eventProfiles = [
    {
      eventName: 'Event Flights Test',
      policyDefinitions: { ...ROUND_NAMING_POLICY, ...POLICY_SEEDING_ITF },
      category: {
        categoryName: 'U12',
      },
      drawProfiles: [
        {
          drawSize: 32,
          qualifyingPositions: 4,
          drawName: 'Main Draw',
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ eventProfiles });

  tournamentEngine.setState(tournamentRecord);
  expect(tournamentRecord.extensions).toBeUndefined();
  expect(tournamentRecord.appliedPolicies).toBeUndefined();

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
  // APPLIED_POLICIES and FLIGHT_PROFILE are first-class in NATIVE, extensions in LEGACY
  expect(firstClassOrExtension({ element: event, attribute: 'appliedPolicies', name: APPLIED_POLICIES })).toBeDefined();
  expect(firstClassOrExtension({ element: event, attribute: 'flightProfile', name: FLIGHT_PROFILE })).toBeDefined();

  expect(Object.keys(event.appliedPolicies ?? {}).length).toEqual(2);

  // There is no POLICY_TYPE_SEEDING on the drawDefinition appliedPolicies because it is attached to the event
  expect(drawDefinition.extensions?.length ?? 0).toEqual(0);
  expect(drawDefinition.appliedPolicies).toBeUndefined();
});

it('policyDefinitions can be passed directly into generateDrawDefintion from drawProfiles', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        policyDefinitions: { ...ROUND_NAMING_POLICY, ...POLICY_SEEDING_ITF },
        drawSize: 32,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);
  expect(tournamentRecord.extensions).toBeUndefined();

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  // the draw's own policies are its appliedPolicies attribute, and it holds no extension
  expect(drawDefinition.extensions?.length ?? 0).toEqual(0);

  expect(Object.keys(drawDefinition.appliedPolicies ?? {}).length).toEqual(2);
});

test('seeding policies attached to tournamentRecords will be used when generating Draws', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, generate: false }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SEEDING_BYES,
  });
  expect(result.success).toEqual(true);
  expect(result.applied).toEqual([POLICY_TYPE_SEEDING]);

  const {
    flightProfile: {
      flights: [flight],
    },
  } = tournamentEngine.getFlightProfile({ eventId });

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    ...flight,
    eventId,
  });

  // there are no 'appliedPolicies' because seeding was found on the policies attached to the tournament
  expect(drawDefinition.extensions?.length ?? 0).toEqual(0);
});
