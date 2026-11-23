import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// `enforcePolicyLimits` decides only whether the SEEDING POLICY's threshold clamps a requested
// seedsCount. Structural limits — drawSize, and the count of entries in the stage — apply either
// way. These tests pin that boundary, because consumers reach for the flag precisely when a
// national rule seeds more deeply than the ITF/USTA thresholds allow.

function seedLimitFor(drawProfile: any): number {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile] });
  tournamentEngine.setState(tournamentRecord);
  const drawId = tournamentRecord.events?.[0]?.drawDefinitions?.[0]?.drawId;
  const result: any = tournamentEngine.getEvent({ drawId });
  return result.drawDefinition.structures[0].seedLimit;
}

it('clamps seedsCount to the policy threshold by default', () => {
  // POLICY_SEEDING_DEFAULT allows 8 seeds at drawSize 32; 16 is requested and refused.
  expect(
    seedLimitFor({
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      participantsCount: 32,
      seedsCount: 16,
      drawSize: 32,
    }),
  ).toEqual(8);
});

it('honors a seedsCount above the policy threshold when enforcePolicyLimits is false', () => {
  expect(
    seedLimitFor({
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      enforcePolicyLimits: false,
      participantsCount: 32,
      seedsCount: 16,
      drawSize: 32,
    }),
  ).toEqual(16);
});

it('still clamps to the entry count when enforcePolicyLimits is false', () => {
  // Structural, not policy: there is no 16th participant to seed.
  expect(
    seedLimitFor({
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      enforcePolicyLimits: false,
      participantsCount: 10,
      seedsCount: 16,
      drawSize: 32,
    }),
  ).toEqual(10);
});

it('accepts a non-power-of-two seedsCount, as round robin group counts require', () => {
  // 15 participants in groups of 3 is 5 groups, and one seed per group is 5 seeds.
  expect(
    seedLimitFor({
      structureOptions: { groupSize: 3 },
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      enforcePolicyLimits: false,
      drawType: ROUND_ROBIN,
      participantsCount: 15,
      seedsCount: 5,
      drawSize: 15,
    }),
  ).toEqual(5);
});
