import { modifyDrawDefinition } from '@Mutate/drawDefinitions/modifyDrawDefinition';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES, FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

it('can modify drawDefinition round naming policy', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        drawSize: 16,
      },
    ],
    participantsProfile: { idPrefix: 'P' },
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(8);
  expect(matchUps[0].abbreviatedRoundName).toEqual('R1');
  expect(matchUps[0].roundName).toEqual('Round 1');

  const policyName = 'League Ad Hoc';
  const customRoundNamingPolicy = {
    [POLICY_TYPE_ROUND_NAMING]: {
      namingConventions: { round: 'Week' },
      affixes: { roundNumber: 'W' },
      policyName,
    },
  };

  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { policyDefinitions: { ...customRoundNamingPolicy } },
    drawName: 'League Play',
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(
    drawDefinition.extensions.find(({ name }) => name === APPLIED_POLICIES).value[POLICY_TYPE_ROUND_NAMING].policyName,
  ).toEqual(policyName);
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps[0].abbreviatedRoundName).toEqual('W1');
  expect(matchUps[0].roundName).toEqual('Week 1');
});

it('returns INVALID_VALUES when drawUpdates is not an object', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  // drawUpdates as undefined
  let result = tournamentEngine.modifyDrawDefinition({ drawId });
  expect(result.error).toEqual(INVALID_VALUES);

  // drawUpdates as a string
  result = tournamentEngine.modifyDrawDefinition({ drawId, drawUpdates: 'invalid' as any });
  expect(result.error).toEqual(INVALID_VALUES);

  // drawUpdates as null
  result = tournamentEngine.modifyDrawDefinition({ drawId, drawUpdates: null as any });
  expect(result.error).toEqual(INVALID_VALUES);
});

it('modifies draw name via drawUpdates.drawName without policyDefinitions', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const newDrawName = 'Updated Draw Name';
  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { drawName: newDrawName },
    drawId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.drawName).toEqual(newDrawName);
});

it('succeeds with empty drawUpdates (no drawName, no policyDefinitions)', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: {},
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('returns error when drawUpdates.drawName is invalid type', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  // drawName as a number should cause modifyDrawName to return an error
  // modifyDrawDefinition line 43 returns nameResult?.error (the raw error object)
  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { drawName: 123 as any },
    drawId,
  });
  // The return is the raw error object from modifyDrawName, so check for error code
  expect(result.success).not.toEqual(true);
});

it('updates flight profile extension when modifying draw name', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const newDrawName = 'Flight Updated';
  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { drawName: newDrawName },
    drawId,
  });
  expect(result.success).toEqual(true);

  // Verify the flight profile extension was updated
  const { event } = tournamentEngine.getEvent({ drawId });
  const flightProfileExt = event.extensions?.find((ext: any) => ext.name === FLIGHT_PROFILE);
  if (flightProfileExt) {
    const flight = flightProfileExt.value.flights?.find((f: any) => f.drawId === drawId);
    expect(flight?.drawName).toEqual(newDrawName);
  }
});

it('applies policyDefinitions without changing drawName', () => {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: AD_HOC,
        automated: true,
        roundsCount: 1,
        drawSize: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition: originalDraw } = tournamentEngine.getEvent({ drawId });
  const originalName = originalDraw.drawName;

  const customPolicy = {
    [POLICY_TYPE_ROUND_NAMING]: {
      namingConventions: { round: 'Session' },
      affixes: { roundNumber: 'S' },
      policyName: 'Session Naming',
    },
  };

  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { policyDefinitions: { ...customPolicy } },
    drawId,
  });
  expect(result.success).toEqual(true);

  // drawName should remain unchanged
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(drawDefinition.drawName).toEqual(originalName);

  // policy should be applied
  const appliedPolicies = drawDefinition.extensions.find(({ name }: any) => name === APPLIED_POLICIES);
  expect(appliedPolicies.value[POLICY_TYPE_ROUND_NAMING].policyName).toEqual('Session Naming');

  // round naming should reflect the policy
  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps[0].abbreviatedRoundName).toEqual('S1');
  expect(matchUps[0].roundName).toEqual('Session 1');
});

it('handles modifyDrawDefinition with invalid drawId', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const result = tournamentEngine.modifyDrawDefinition({
    drawUpdates: { drawName: 'New Name' },
    drawId: 'non-existent-draw-id',
  });
  // Engine hydration may not find the draw; result should not indicate success
  expect(result.success).not.toEqual(true);
});

it('returns MISSING_DRAW_DEFINITION when neither flight nor drawDefinition exist', () => {
  // Call the function directly to test the branch at line 47
  // where both flight and drawDefinition are absent
  const result = modifyDrawDefinition({
    drawUpdates: { drawName: undefined as any, policyDefinitions: undefined as any },
    tournamentRecord: { tournamentId: 'test' } as any,
    drawDefinition: undefined as any,
    drawId: 'non-existent',
    event: {} as any,
  });
  expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
});

it('skips drawDefinition block when drawDefinition is absent but flight exists', () => {
  // Call the function directly to cover the false branch of `if (drawDefinition)` at line 63
  // and the true branch of `if (flight)` at line 51 when drawDefinition is absent
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const event = tournamentRecord.events[0];

  // Call directly with a valid event (which has a flightProfile) but no drawDefinition
  const result = modifyDrawDefinition({
    drawUpdates: { drawName: undefined as any, policyDefinitions: undefined as any },
    tournamentRecord,
    drawDefinition: undefined as any,
    drawId,
    event,
  });
  // flight is found via flightProfile, so it should succeed even without drawDefinition
  expect(result.success).toEqual(true);
});

it('skips flight extension block when no flight exists but drawDefinition is present', () => {
  // Call the function directly to cover the false branch of `if (flight)` at line 51
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];

  // Pass an empty event so flightProfile is absent → no flight found
  const result = modifyDrawDefinition({
    drawUpdates: { drawName: undefined as any, policyDefinitions: undefined as any },
    tournamentRecord,
    drawDefinition,
    drawId: 'mismatched-draw-id',
    event: {} as any,
  });
  // drawDefinition exists, so the function succeeds even without a flight
  expect(result.success).toEqual(true);
});
